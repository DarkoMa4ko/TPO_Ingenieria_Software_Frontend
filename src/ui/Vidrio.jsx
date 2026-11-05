import { createElement, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Vidrio líquido: el fondo se refracta en los bordes como a través de una lente,
// con una leve aberración cromática. Adaptado de "liquid glass" de Jhey Tompkins
// (MIT, https://codepen.io/jh3y/pen/EajLxJV): un filtro SVG en `backdrop-filter`
// desplaza lo que hay detrás según un mapa de desplazamiento (degradé rojo en X,
// azul en Y, apagado en el centro) armado a la medida de cada elemento.
//
// `backdrop-filter: url()` sólo funciona en Chromium (Chrome, Edge, Opera). En los
// demás navegadores queda un desenfoque común (ver .vidrio en index.css).
const SOPORTA_FILTRO = typeof navigator !== 'undefined'
  && Boolean(navigator.userAgentData?.brands?.some((marca) => /Chromium/.test(marca.brand)));

// Mapa de desplazamiento del original: el rojo crece hacia la izquierda, el azul
// hacia abajo (en "difference") y un rectángulo gris difuso adentro deja quieto
// el centro, así sólo se doblan los bordes. En los paneles grandes el centro
// queda del todo quieto: con el 0,93 del original se veía un arcoíris adentro.
function mapaDesplazamiento(ancho, alto, radio, borde) {
  const franja = Math.min(ancho, alto) * (borde * 0.5);
  const quieto = Math.min(ancho, alto) > 160 ? 1 : 0.93;
  const svg = `<svg viewBox="0 0 ${ancho} ${alto}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="red"/></linearGradient>
      <linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="blue"/></linearGradient>
    </defs>
    <rect width="${ancho}" height="${alto}" fill="black"/>
    <rect width="${ancho}" height="${alto}" rx="${radio}" fill="url(#r)"/>
    <rect width="${ancho}" height="${alto}" rx="${radio}" fill="url(#b)" style="mix-blend-mode:difference"/>
    <rect x="${franja}" y="${franja}" width="${ancho - franja * 2}" height="${alto - franja * 2}" rx="${radio}" fill="hsl(0 0% 50% / ${quieto})" style="filter:blur(11px)"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Aparición y salida líquidas (ver .vidrio[data-gota] en index.css): el vidrio nace
// como una gota redonda, o desde el control que lo abre (`desde`, el mismo valor
// que el data-gota-origen de ese control), fluye hasta su forma y se asienta; al
// irse se contrae en una gota (o vuelve al control) y se evapora. Acá se calcula
// la forma inicial: escala de cada eje, radio y punto de origen.
const VARIABLES_GOTA = ['--gota-x0', '--gota-y0', '--gota-r0', '--origen-gota', '--retraso-gota'];

function geometriaGota(el, desde) {
  const ancho = el.offsetWidth;
  const alto = el.offsetHeight;
  if (!ancho || !alto) return null;
  const control = desde ? document.querySelector(`[data-gota-origen="${desde}"]`) : null;
  if (control?.offsetWidth) {
    // Tamaño de diseño del control (sin su propia animación) y su centro en pantalla.
    const c = control.getBoundingClientRect();
    const w = control.offsetWidth;
    const h = control.offsetHeight;
    const x0 = w / ancho;
    const y0 = h / alto;
    if (x0 < 0.9 && y0 < 0.9) {
      // Origen tal que el elemento, escalado a x0 × y0, quede justo sobre el control.
      // La posición sale del diseño (offsetLeft/Top), que no incluye la escala.
      const padre = el.offsetParent;
      const base = padre ? padre.getBoundingClientRect() : { left: 0, top: 0 };
      const izquierda = base.left + (padre?.clientLeft ?? 0) + el.offsetLeft;
      const arriba = base.top + (padre?.clientTop ?? 0) + el.offsetTop;
      const ox = (c.left + c.width / 2 - w / 2 - izquierda) / (1 - x0);
      const oy = (c.top + c.height / 2 - h / 2 - arriba) / (1 - y0);
      return { x0, y0, r0: Math.min(w, h) / 2, origen: `${ox.toFixed(1)}px ${oy.toFixed(1)}px` };
    }
  }
  const gota = Math.min(Math.max(Math.min(ancho, alto) * 0.34, 24), 120);
  return { x0: gota / ancho, y0: gota / alto, r0: gota / 2, origen: null };
}

function aplicarGota(el, { x0, y0, r0, origen }, fase, retraso = null) {
  if (retraso !== null) el.style.setProperty('--retraso-gota', `${retraso}s`);
  el.style.setProperty('--gota-x0', x0.toFixed(4));
  el.style.setProperty('--gota-y0', y0.toFixed(4));
  el.style.setProperty('--gota-r0', `${r0.toFixed(1)}px`);
  if (origen) el.style.setProperty('--origen-gota', origen);
  else el.style.removeProperty('--origen-gota');
  el.dataset.gota = fase;
}

function limpiarGota(el) {
  delete el.dataset.gota;
  VARIABLES_GOTA.forEach((variable) => el.style.removeProperty(variable));
}

// as: etiqueta o componente; radio: el border-radius del elemento (tiene que
// coincidir para que el borde que refracta siga su forma); tinte: cuánto se
// oscurece el vidrio (0 transparente, 1 opaco), para que el texto se lea;
// saliendo: hace la animación de salida (ver useSalida); desde: el control del
// que nace y al que vuelve; retraso: segundos antes de aparecer (sólo al montarse).
export default function Vidrio({ as = 'div', radio = 18, tinte = 0.2, borde = 0.07, saliendo = false, desde = null, retraso = null, className = '', style, children, ...resto }) {
  const ref = useRef(null);
  const id = `vidrio-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [tam, setTam] = useState(null);
  const geometria = useRef(null);

  // Entrada: la forma inicial se fija antes del primer cuadro.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const alTerminar = (evento) => {
      if (evento.target === el && evento.animationName === 'gota-r-entra') limpiarGota(el);
    };
    el.addEventListener('animationend', alTerminar);
    // En desarrollo React corre el efecto dos veces: la gota ya armada no se rehace.
    if (!el.dataset.gota) {
      geometria.current = geometriaGota(el, desde);
      if (geometria.current) aplicarGota(el, geometria.current, 'entra', retraso);
    }
    return () => el.removeEventListener('animationend', alTerminar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salida (y vuelta, si se la pide de nuevo antes de terminar de irse).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (saliendo) {
      // Con la entrada a medio camino la caja está escalada: se usa la de la entrada.
      const g = (!el.dataset.gota && geometriaGota(el, desde)) || geometria.current;
      if (g) aplicarGota(el, g, 'sale');
    } else if (el.dataset.gota === 'sale' && geometria.current) {
      aplicarGota(el, geometria.current, 'entra', 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saliendo]);

  useLayoutEffect(() => {
    if (!SOPORTA_FILTRO || !ref.current) return undefined;
    const observador = new ResizeObserver(([entrada]) => {
      const caja = entrada.borderBoxSize?.[0];
      const ancho = Math.round(caja ? caja.inlineSize : entrada.contentRect.width);
      const alto = Math.round(caja ? caja.blockSize : entrada.contentRect.height);
      setTam((previo) => (previo && previo.ancho === ancho && previo.alto === alto ? previo : { ancho, alto }));
    });
    observador.observe(ref.current);
    return () => observador.disconnect();
  }, []);

  const mapa = useMemo(
    () => (tam && tam.ancho > 0 && tam.alto > 0 ? mapaDesplazamiento(tam.ancho, tam.alto, radio, borde) : null),
    [tam, radio, borde],
  );
  // Los elementos chicos (botones) refractan menos: con la fuerza de un panel se
  // deformaban de más; y en los grandes un borde de 180 px de desplazamiento se nota sucio.
  const escala = tam ? -Math.min(120, Math.min(tam.ancho, tam.alto) * 1.1) : -120;

  return createElement(
    as,
    {
      ref,
      className: `vidrio ${className}`.trim(),
      style: { ...style, '--tinte': tinte, '--radio-vidrio': `${radio}px`, ...(mapa ? { '--vidrio-filtro': `url(#${id})` } : null) },
      ...resto,
    },
    mapa && (
      <svg className="vidrio-filtro" aria-hidden="true" focusable="false">
        <defs>
          <filter id={id} colorInterpolationFilters="sRGB">
            <feImage x="0" y="0" width="100%" height="100%" href={mapa} result="mapa" />
            {/* Cada canal se desplaza un poco distinto: aberración cromática (más suave que en el original). */}
            <feDisplacementMap in="SourceGraphic" in2="mapa" scale={escala} xChannelSelector="R" yChannelSelector="B" result="desplR" />
            <feColorMatrix in="desplR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rojo" />
            <feDisplacementMap in="SourceGraphic" in2="mapa" scale={escala + 4} xChannelSelector="R" yChannelSelector="B" result="desplG" />
            <feColorMatrix in="desplG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="verde" />
            <feDisplacementMap in="SourceGraphic" in2="mapa" scale={escala + 8} xChannelSelector="R" yChannelSelector="B" result="desplB" />
            <feColorMatrix in="desplB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="azul" />
            <feBlend in="rojo" in2="verde" mode="screen" result="rg" />
            <feBlend in="rg" in2="azul" mode="screen" result="salida" />
            <feGaussianBlur in="salida" stdDeviation="0.6" />
          </filter>
        </defs>
      </svg>
    ),
    children,
  );
}
