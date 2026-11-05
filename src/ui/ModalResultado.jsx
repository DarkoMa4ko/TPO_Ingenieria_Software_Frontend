import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { esMate, esTablas, ganador, glifo } from '../utils/resultado.js';
import { capturasDeJugadas, FEN_INICIAL } from '../utils/capturas.js';
import { IconoMas } from './Iconos.jsx';
import Vidrio from './Vidrio.jsx';

export default function ModalResultado({ onCerrar, onNueva, saliendo = false }) {
  const { resultado, turno, jugadores, jugadas, fenInicial, marcador } = useSelector((s) => s.partida);
  const cerrarRef = useRef(null);
  useEffect(() => {
    cerrarRef.current?.focus();
    const manejarTecla = (evento) => { if (evento.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [onCerrar]);

  const tablas = esTablas(resultado);
  const mate = esMate(resultado);
  const gana = ganador(resultado, turno);
  const nombreGanador = gana === 'w' ? (jugadores?.blanco || 'Blancas') : (jugadores?.negro || 'Negras');
  const capturas = useMemo(() => capturasDeJugadas(jugadas, fenInicial || FEN_INICIAL), [jugadas, fenInicial]);
  const detalle = (resultado || '').split(':').pop().trim();
  // Marcador de la sesión acumulado (tablas valen ½ para cada bando).
  const puntos = (n) => {
    const entero = Math.floor(n);
    const medio = n - entero > 0;
    return `${entero}${medio ? '½' : ''}`;
  };
  const scoreBlancas = puntos((marcador?.w ?? 0) + (marcador?.t ?? 0) / 2);
  const scoreNegras = puntos((marcador?.b ?? 0) + (marcador?.t ?? 0) / 2);

  return (
    <div className={`resultado-superposicion ${saliendo ? 'saliendo' : ''}`} role="presentation">
      <Vidrio as="section" radio={28} tinte={0.5} className="resultado-dialogo" saliendo={saliendo} role="dialog" aria-modal="true" aria-labelledby="resultado-titulo" aria-describedby="resultado-descripcion">
        <div className={`resultado-emblema ${gana === 'b' ? 'negro' : ''}`} aria-hidden="true">
          {tablas ? '½' : glifo('k', gana === 'w')}
        </div>
        <span className="eyebrow">{tablas ? 'Partida igualada' : mate ? 'Victoria por jaque mate' : 'Partida finalizada'}</span>
        <h2 id="resultado-titulo">{tablas ? 'Tablas' : mate ? 'Jaque mate' : 'Fin de la partida'}</h2>
        <p id="resultado-descripcion" className="resultado-texto">
          {tablas ? detalle || 'Ningún bando logra imponerse.' : <>Ganan las {gana === 'w' ? 'blancas' : 'negras'} — <strong>{nombreGanador}</strong></>}
        </p>

        <dl className="resultado-datos">
          <div><dt>Jugadas</dt><dd>{jugadas.length}</dd></div>
          <div><dt>Capturas</dt><dd>{capturas.length}</dd></div>
          <div>
            <dt>Marcador</dt>
            <dd>
              {scoreBlancas}
              <span className="resultado-separador">–</span>
              {scoreNegras}
            </dd>
          </div>
        </dl>

        <div className="resultado-botones">
          <button type="button" className="boton-oro" onClick={onNueva}><IconoMas /> Nueva partida</button>
          <button type="button" className="boton-linea" ref={cerrarRef} onClick={onCerrar}>Ver el tablero</button>
        </div>
      </Vidrio>
    </div>
  );
}
