import { useEffect, useRef, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { CAJA_LOGO, TRAZOS_LOGO } from './LogoGrupo.jsx';

// Pantalla de carga. El logo del grupo se llena de luz líquida a medida que
// carga la escena; al terminar se llena de blanco, se encoge un instante y pasa
// a ser un hueco en el fondo negro que crece hasta cubrir la pantalla: el logo
// hace de máscara y revela la escena, abriéndose desde el centro del logo.
//
// Mientras carga, el hilo principal se bloquea en tandas de casi un segundo
// (modelos, texturas, shaders), así que todo lo que se mueve en la carga es CSS
// sobre transform y opacity: lo anima el compositor y no se traba. El revelado
// sí se dibuja cuadro a cuadro (el hueco es una máscara SVG), por eso arranca
// recién cuando los cuadros vuelven a ser parejos.

const MINIMO = 1700; // ms que se ve como mínimo, aunque todo esté en caché
const LLENADO = 950; // lo que tarda la transición del nivel hasta el 100 %
const CUADRO_TRANQUILO = 30; // ms: un cuadro más largo corta la racha
const RACHA = 12; // cuadros tranquilos seguidos para revelar
const ESPERA_MAXIMA = 5000; // ms con todo cargado: se revela igual
const ANTICIPO = 420; // se llena de blanco y se encoge (transición CSS)
const ZOOM = 1350; // el hueco crece hasta cubrir la pantalla
const DESVANECER_BLANCO = 260;
const OLA = 12; // alto de las olas, en px
// El zoom va al centro del logo. El centro exacto cae en el hueco entre los dos
// sietes, así que apunta al medio del trazo diagonal del primero, a esa altura: una
// franja rellena (en unidades del logo: ±145 a lo largo, ±18 de ancho) que al
// final cubre la pantalla.
const TRAZO = { x: 283.4, y: 370.5, dx: -0.4494, dy: 0.8934, medioLargo: 145, medioAncho: 18 };

// Escala con la que la franja, centrada, cubre toda la pantalla.
function escalaFinal(w, h) {
  const aLoAncho = (w / 2) * Math.abs(TRAZO.dy) + (h / 2) * Math.abs(TRAZO.dx);
  const aLoLargo = (w / 2) * Math.abs(TRAZO.dx) + (h / 2) * Math.abs(TRAZO.dy);
  return 1.1 * Math.max(aLoAncho / TRAZO.medioAncho, aLoLargo / TRAZO.medioLargo);
}
const CENTRO = { x: CAJA_LOGO.x + CAJA_LOGO.w / 2, y: CAJA_LOGO.y + CAJA_LOGO.h / 2 };

const svgDatos = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const MASCARA = svgDatos(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CAJA_LOGO.x} ${CAJA_LOGO.y} ${CAJA_LOGO.w} ${CAJA_LOGO.h}">${TRAZOS_LOGO.map((d) => `<path d="${d}"/>`).join('')}</svg>`,
);
// Un período de ola; se repite en x y se corre exactamente un período (sin saltos).
const ola = (ancho, alto, color) => svgDatos(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none"><path d="M0 ${alto / 2} Q ${ancho / 4} 0 ${ancho / 2} ${alto / 2} T ${ancho} ${alto / 2} V ${alto} H 0 Z" fill="${color}"/></svg>`,
);
const OLA_FRENTE = ola(72, OLA, '#ffffff');
const OLA_FONDO = ola(104, OLA + 4, 'rgba(214, 230, 255, 0.55)');

function azarConSemilla(semilla) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = azarConSemilla(7);
const CHISPAS = Array.from({ length: 22 }, () => ({
  x: (azar() - 0.5) * 1.3,
  y: 0.3 + azar() * 0.25,
  tam: 1.2 + azar() * 2.2,
  duracion: 3.2 + azar() * 3,
  retraso: -azar() * 6,
}));

const limitar = (x) => Math.min(1, Math.max(0, x));
const suave = (x) => x * x * (3 - 2 * x);
const altoLogo = (h) => Math.min(Math.max(h * 0.36, 170), 330);

export default function Cargador({ onFin }) {
  const { active, progress, loaded, total } = useProgress();
  const [terminado, setTerminado] = useState(false);
  const [tam, setTam] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const raiz = useRef(null);
  const flota = useRef(null);
  const hueco = useRef(null);
  const logo = useRef(null);
  const blanco = useRef(null);
  const borde = useRef(null);
  const listo = !active && progress >= 100;
  // drei reinicia `progress` en cada tanda de carga (modelos, después texturas...):
  // el nivel usa los ítems acumulados y nunca baja. Hasta que termina, no pasa del 96 %.
  const avance = useRef(0);
  avance.current = Math.max(avance.current, listo ? 1 : Math.min(total > 0 ? loaded / total : 0, 0.96));
  const vivo = useRef({});
  vivo.current = { listo, inactivo: !active && total === 0, tam, onFin };

  useEffect(() => {
    const alCambiar = () => setTam({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);

  useEffect(() => {
    if (terminado) return undefined;
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const inicio = performance.now();
    let previo = inicio;
    let racha = 0;
    let listoDesde = null;
    let completoDesde = null;
    let revelado = null;
    let corrimiento = 0;
    let id = 0;

    const terminar = () => {
      setTerminado(true);
      vivo.current.onFin?.();
    };

    const cuadro = (ahora) => {
      racha = ahora - previo < CUADRO_TRANQUILO ? racha + 1 : 0;
      previo = ahora;
      const v = vivo.current;
      // Si nunca empezó a cargar nada (no debería pasar), no se queda trabado.
      if (v.listo || (v.inactivo && ahora - inicio > 8000)) listoDesde ??= ahora;
      else listoDesde = null;

      if (completoDesde === null) {
        const lleno = listoDesde !== null && ahora - listoDesde > LLENADO;
        const tranquilo = racha >= RACHA || (listoDesde !== null && ahora - listoDesde > ESPERA_MAXIMA);
        if (lleno && tranquilo && ahora - inicio > MINIMO) {
          completoDesde = ahora;
          raiz.current.classList.add('completo');
        }
      } else if (revelado === null && ahora - completoDesde >= ANTICIPO) {
        // Dónde quedó el logo con el vaivén, para que el hueco arranque justo ahí.
        const estilo = flota.current ? getComputedStyle(flota.current).transform : 'none';
        corrimiento = estilo && estilo !== 'none' ? new DOMMatrixReadOnly(estilo).m42 : 0;
        revelado = ahora;
        raiz.current.classList.add('revelando');
      }

      if (revelado !== null) {
        const r = ahora - revelado;
        if (reducido) {
          raiz.current.style.opacity = String(1 - limitar(r / 500));
          if (r >= 500) { terminar(); return; }
        } else {
          const { w, h } = v.tam;
          const u = limitar(r / ZOOM);
          const s1 = (altoLogo(h) / CAJA_LOGO.h) * 0.92;
          const s = s1 * (escalaFinal(w, h) / s1) ** (u ** 2.3);
          // Zoom hacia el trazo central, que de paso se va al centro de la pantalla.
          const cy = h * 0.47 + corrimiento;
          const x0 = w / 2 + s1 * (TRAZO.x - CENTRO.x);
          const y0 = cy + s1 * (TRAZO.y - CENTRO.y);
          const m = suave(u);
          const transformacion = `translate(${x0 + (w / 2 - x0) * m} ${y0 + (h / 2 - y0) * m}) scale(${s}) translate(${-TRAZO.x} ${-TRAZO.y})`;
          hueco.current?.setAttribute('transform', transformacion);
          logo.current?.setAttribute('transform', transformacion);
          blanco.current?.setAttribute('opacity', (1 - limitar(r / DESVANECER_BLANCO)).toFixed(3));
          borde.current?.setAttribute('opacity', (0.9 * (1 - u)).toFixed(3));
          raiz.current.style.opacity = String(u > 0.88 ? 1 - (u - 0.88) / 0.12 : 1);
          if (u >= 1) { terminar(); return; }
        }
      }
      id = requestAnimationFrame(cuadro);
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, [terminado]);

  if (terminado) return null;
  const { w, h } = tam;
  const alto = altoLogo(h);
  // Nivel del líquido: de debajo del logo (0 %) a apenas por encima (100 %).
  const p = avance.current;
  const nivel = alto - p * (alto + OLA + 2);
  const trazos = TRAZOS_LOGO.map((d) => <path key={d.slice(0, 24)} d={d} />);

  return (
    <div
      className="cargador"
      ref={raiz}
      role="status"
      aria-label={`Cargando ${Math.round(p * 100)} %`}
      style={{ '--alto': `${alto}px`, '--mascara': MASCARA, '--ola-frente': OLA_FRENTE, '--ola-fondo': OLA_FONDO }}
    >
      <div className="cargador-fondo" />
      <div className="cargador-aura" style={{ opacity: 0.3 + 0.7 * p }}><i /></div>
      <div className="cargador-chispas" aria-hidden="true">
        {CHISPAS.map((c, i) => (
          <i
            key={i}
            style={{
              left: `calc(50% + ${c.x} * var(--alto) * 0.5)`,
              top: `calc(47% + ${c.y} * var(--alto))`,
              width: c.tam,
              height: c.tam,
              animationDuration: `${c.duracion}s`,
              animationDelay: `${c.retraso}s`,
            }}
          />
        ))}
      </div>

      <div className="cargador-escena" aria-hidden="true">
        <div className="cargador-flota" ref={flota}>
          <div className="cargador-logo">
            <div className="cargador-halo" style={{ opacity: 0.25 + 0.75 * p }}>
              <div className="cargador-forma">
                <div className="cargador-nivel" style={{ transform: `translate3d(0, ${nivel}px, 0)` }} />
              </div>
            </div>
            <div className="cargador-vaso">
              <div className="cargador-nivel" style={{ transform: `translate3d(0, ${nivel}px, 0)` }}>
                <div className="cargador-inclina">
                  <div className="cargador-ola fondo" />
                  <div className="cargador-cuerpo" />
                  <div className="cargador-ola frente" />
                </div>
              </div>
              <div className="cargador-reflejo" />
              <div className="cargador-lleno" />
            </div>
            <svg className="cargador-contorno" viewBox={`${CAJA_LOGO.x} ${CAJA_LOGO.y} ${CAJA_LOGO.w} ${CAJA_LOGO.h}`}>
              {TRAZOS_LOGO.map((d) => <path key={d.slice(0, 24)} d={d} vectorEffect="non-scaling-stroke" />)}
            </svg>
          </div>
        </div>
      </div>
      <p className="cargador-porcentaje">{Math.round(p * 100)}%</p>

      {/* Revelado: el fondo con el logo recortado. Oculto (sin costo) hasta que empieza. */}
      <svg className="cargador-revelado" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <defs>
          <radialGradient id="cargador-fondo" cx="50%" cy="46%" r="75%">
            <stop offset="0" stopColor="#0c1018" />
            <stop offset="0.55" stopColor="#05060a" />
            <stop offset="1" stopColor="#020203" />
          </radialGradient>
          <mask id="cargador-hueco" maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
            <rect width={w} height={h} fill="#fff" />
            <g ref={hueco} fill="#000">{trazos}</g>
          </mask>
        </defs>
        <rect width={w} height={h} fill="url(#cargador-fondo)" mask="url(#cargador-hueco)" />
        <g ref={logo}>
          <g ref={blanco} fill="#fff">{trazos}</g>
          <g ref={borde} fill="none" stroke="rgb(214, 232, 255)" strokeWidth="1">
            {TRAZOS_LOGO.map((d) => <path key={d.slice(0, 24)} d={d} vectorEffect="non-scaling-stroke" />)}
          </g>
        </g>
      </svg>
      <div className="cargador-grano" aria-hidden="true" />
    </div>
  );
}
