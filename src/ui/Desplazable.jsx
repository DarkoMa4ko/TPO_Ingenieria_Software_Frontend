import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Contenedor con barra de desplazamiento propia, como las de macOS: invisible en
// reposo, aparece mientras se desplaza (o mientras se la arrastra) y se va sola un
// momento después. La barra nativa queda oculta.
const ESPERA = 900; // ms quieto hasta que se va
const MARGEN = 4; // px arriba y abajo del recorrido
const MINIMO = 28; // alto mínimo del pulgar

// as: etiqueta del contenido que se desplaza (div, ol...); className: el envoltorio
// (tamaño y lugar); claseContenido: el contenido. La ref apunta al contenido.
const Desplazable = forwardRef(function Desplazable({ as = 'div', className = '', claseContenido = '', children, ...resto }, ref) {
  const contenido = useRef(null);
  const barra = useRef(null);
  const pulgar = useRef(null);
  useImperativeHandle(ref, () => contenido.current);

  useEffect(() => {
    const el = contenido.current;
    const riel = barra.current;
    const mango = pulgar.current;
    if (!el || !riel || !mango) return undefined;
    let ocultar = 0;
    let cuadro = 0;
    let arrastre = null;

    const geometria = () => {
      const { scrollHeight, clientHeight } = el;
      const alto = Math.max(MINIMO, (clientHeight * clientHeight) / scrollHeight);
      return { alto, recorrido: clientHeight - alto - MARGEN * 2, sobra: scrollHeight - clientHeight };
    };
    const medir = () => {
      cuadro = 0;
      const { alto, recorrido, sobra } = geometria();
      riel.classList.toggle('sin-desplazamiento', sobra <= 1);
      if (sobra <= 1) return;
      mango.style.height = `${alto}px`;
      mango.style.transform = `translate3d(0, ${MARGEN + (el.scrollTop / sobra) * recorrido}px, 0)`;
    };
    const pedirMedida = () => { if (!cuadro) cuadro = requestAnimationFrame(medir); };
    const mostrar = () => {
      riel.classList.add('visible');
      clearTimeout(ocultar);
      if (!arrastre) ocultar = setTimeout(() => riel.classList.remove('visible'), ESPERA);
    };
    const alDesplazar = () => { pedirMedida(); mostrar(); };

    // Arrastrar el pulgar desplaza el contenido en proporción.
    const alPresionar = (evento) => {
      evento.preventDefault();
      arrastre = { y: evento.clientY, desde: el.scrollTop };
      mango.setPointerCapture(evento.pointerId);
      riel.classList.add('arrastrando');
      mostrar();
    };
    const alMover = (evento) => {
      if (!arrastre) return;
      const { recorrido, sobra } = geometria();
      el.scrollTop = arrastre.desde + ((evento.clientY - arrastre.y) * sobra) / Math.max(1, recorrido);
    };
    const alSoltar = () => {
      if (!arrastre) return;
      arrastre = null;
      riel.classList.remove('arrastrando');
      mostrar();
    };

    el.addEventListener('scroll', alDesplazar, { passive: true });
    mango.addEventListener('pointerdown', alPresionar);
    mango.addEventListener('pointermove', alMover);
    mango.addEventListener('pointerup', alSoltar);
    mango.addEventListener('pointercancel', alSoltar);
    // Cambia el alto de la caja o del contenido (se agregan jugadas, cambia el tamaño).
    const tamanio = new ResizeObserver(pedirMedida);
    tamanio.observe(el);
    const cambios = new MutationObserver(pedirMedida);
    cambios.observe(el, { childList: true, subtree: true });
    medir();

    return () => {
      el.removeEventListener('scroll', alDesplazar);
      mango.removeEventListener('pointerdown', alPresionar);
      mango.removeEventListener('pointermove', alMover);
      mango.removeEventListener('pointerup', alSoltar);
      mango.removeEventListener('pointercancel', alSoltar);
      tamanio.disconnect();
      cambios.disconnect();
      clearTimeout(ocultar);
      cancelAnimationFrame(cuadro);
    };
  }, []);

  return (
    <div className={`desplazable ${className}`.trim()}>
      {createElement(as, { ref: contenido, className: `desplazable-contenido ${claseContenido}`.trim(), ...resto }, children)}
      <div className="desplazable-barra sin-desplazamiento" ref={barra} aria-hidden="true">
        <div className="desplazable-pulgar" ref={pulgar} />
      </div>
    </div>
  );
});

export default Desplazable;
