import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { capturasDeJugadas, FEN_INICIAL } from '../utils/capturas.js';
import { VALORES, glifo } from '../utils/resultado.js';
import Vidrio from './Vidrio.jsx';
import LogoGrupo from './LogoGrupo.jsx';
import { nombreJugador } from '../utils/jugadores.js';

// Un jugador dentro del marcador: el medallón (encastrado en el extremo redondo),
// el nombre y las piezas que capturó. Las negras van espejadas.
function Jugador({ nombre, blanco, activo, enJaque, capturadas }) {
  return (
    <div className={`marcador-jugador ${blanco ? 'blanco' : 'negro'} ${activo ? 'activo' : ''} ${enJaque ? 'jaque' : ''}`}>
      <span className={`marcador-medallon ${blanco ? 'blanco' : 'negro'}`} aria-hidden="true">{blanco ? '♔' : '♚'}</span>
      <div className="marcador-datos">
        <strong className="marcador-nombre">{nombre}</strong>
        <span className="marcador-capturas" aria-label={`${capturadas.length} piezas capturadas`}>
          {capturadas.map((c) => (
            <span key={c.orden} className="mini-pieza">{glifo(c.tipo, c.blanco)}</span>
          ))}
        </span>
      </div>
    </div>
  );
}

// Marcador: una sola cápsula de vidrio, con un jugador en cada extremo y el logo
// en el centro. La mitad de quien juega se ilumina en verde (en rojo en el jaque).
export default function Hud({ saliendo = false }) {
  const { jugadores, turno, finalizada, enJaque, jugadas, fenInicial } = useSelector((s) => s.partida);
  const capturas = useMemo(() => capturasDeJugadas(jugadas, fenInicial || FEN_INICIAL), [jugadas, fenInicial]);

  // Las blancas muestran las piezas negras que capturaron, y viceversa.
  const deBlancas = capturas.filter((c) => !c.blanco).sort((a, b) => VALORES[b.tipo] - VALORES[a.tipo]);
  const deNegras = capturas.filter((c) => c.blanco).sort((a, b) => VALORES[b.tipo] - VALORES[a.tipo]);

  const jaque = enJaque && !finalizada;
  const estado = finalizada ? 'Partida terminada' : jaque ? 'Jaque' : '';
  const clases = ['marcador', turno === 'b' ? 'turno-negras' : '', jaque ? 'jaque' : '', finalizada ? 'terminada' : ''];

  return (
    <div className="hud">
      <Vidrio radio={29} tinte={0.36} className={clases.filter(Boolean).join(' ')} saliendo={saliendo} retraso={1.6}>
        <Jugador nombre={nombreJugador(jugadores, true)} blanco activo={turno === 'w' && !finalizada} enJaque={turno === 'w' && jaque} capturadas={deBlancas} />
        <div className="marcador-centro">
          <LogoGrupo className="marcador-logo" />
          <span className="oculto-visual" aria-live="polite">{estado}</span>
        </div>
        <Jugador nombre={nombreJugador(jugadores, false)} blanco={false} activo={turno === 'b' && !finalizada} enJaque={turno === 'b' && jaque} capturadas={deNegras} />
      </Vidrio>
    </div>
  );
}
