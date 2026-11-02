import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Vidrio from './Vidrio.jsx';
import SeccionPartida from './SeccionPartida.jsx';
import SeccionAjustes from './SeccionAjustes.jsx';

const ETIQUETAS = { partida: 'Panel de la partida', ajustes: 'Ajustes' };
// Las secciones van una al lado de la otra en el mismo orden que sus botones en la
// barra: la partida a la izquierda, los ajustes a la derecha.
const SECCIONES = ['partida', 'ajustes'];
// Resorte con amortiguación crítica: arranca suave, frena sin pasarse ni rebotar.
const RESPUESTA = 0.46; // segundos
const RIGIDEZ = (2 * Math.PI) / RESPUESTA;

// Panel lateral único: muestra la partida o los ajustes, nunca uno encima del otro.
// Al cambiar de sección el vidrio se queda y el contenido se desliza como una tira
// (hacia la izquierda para ir a los ajustes, hacia la derecha para volver). El
// movimiento es el de un resorte calculado cuadro a cuadro, así se puede revertir a
// mitad de camino sin saltos. Nace del botón de la sección que lo abre y, al
// cerrarse, vuelve al de la sección que estaba mostrando.
export default function PanelLateral({ seccion, saliendo, retraso, onNueva }) {
  const [montadas, setMontadas] = useState(() => [seccion]);
  const capas = useRef({});
  const pista = useRef(null);
  // x: posición de la tira (0 = partida, 1 = ajustes); v: velocidad.
  const tira = useRef({ x: SECCIONES.indexOf(seccion), v: 0, destino: SECCIONES.indexOf(seccion) });

  // Cada sección se corre según su distancia a la que se ve, y se atenúa un poco al alejarse.
  const ubicar = (x) => {
    SECCIONES.forEach((nombre, indice) => {
      const capa = capas.current[nombre];
      if (!capa) return;
      const distancia = indice - x;
      capa.style.transform = `translate3d(${(distancia * 100).toFixed(3)}%, 0, 0)`;
      capa.style.opacity = (1 - 0.6 * Math.min(1, Math.abs(distancia))).toFixed(3);
    });
  };

  // La sección nueva se monta antes de pintarse, ya ubicada fuera de vista de su lado.
  useLayoutEffect(() => {
    setMontadas((actuales) => (actuales.includes(seccion) ? actuales : [...actuales, seccion]));
  }, [seccion]);
  useLayoutEffect(() => ubicar(tira.current.x), [montadas]);

  useEffect(() => {
    const t = tira.current;
    const destino = SECCIONES.indexOf(seccion);
    t.destino = destino;
    if (t.x === destino && t.v === 0) return undefined;
    // Parte de donde está y con la velocidad que lleva: solución exacta del resorte crítico.
    const x0 = t.x - destino;
    const impulso = t.v + RIGIDEZ * x0;
    const inicio = performance.now();
    pista.current?.classList.add('moviendo');
    let cuadro = 0;
    const paso = (ahora) => {
      const s = (ahora - inicio) / 1000;
      const caida = Math.exp(-RIGIDEZ * s);
      t.x = destino + (x0 + impulso * s) * caida;
      t.v = (impulso - RIGIDEZ * (x0 + impulso * s)) * caida;
      if (Math.abs(t.x - destino) < 0.0006 && Math.abs(t.v) < 0.005) {
        t.x = destino;
        t.v = 0;
        ubicar(destino);
        pista.current?.classList.remove('moviendo');
        setMontadas([seccion]);
        return;
      }
      ubicar(t.x);
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [seccion]);

  return (
    <Vidrio
      as="aside"
      radio={22}
      tinte={0.42}
      className="panel"
      saliendo={saliendo}
      desde={seccion === 'ajustes' ? 'ajustes' : 'panel'}
      retraso={retraso}
      aria-label={ETIQUETAS[seccion]}
    >
      <div className="panel-pista" ref={pista}>
        {SECCIONES.filter((nombre) => montadas.includes(nombre)).map((nombre) => (
          <div
            key={nombre}
            ref={(el) => { capas.current[nombre] = el; }}
            className="panel-capa"
            aria-hidden={nombre !== seccion || undefined}
            inert={nombre !== seccion ? '' : undefined}
          >
            {nombre === 'ajustes' ? <SeccionAjustes /> : <SeccionPartida onNueva={onNueva} />}
          </div>
        ))}
      </div>
    </Vidrio>
  );
}
