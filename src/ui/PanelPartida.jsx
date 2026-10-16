import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { crearPartida, rendirse, cambiarPerspectiva } from '../store/partidaSlice.js';
import { PERSPECTIVAS } from './perspectivas.js';

export default function PanelPartida() {
  const { id, jugadores, finalizada, resultado, enJaque, turno, cargando, error, perspectiva } =
    useSelector((s) => s.partida);
  const despachar = useDispatch();
  const [blanco, setBlanco] = useState('');
  const [negro, setNegro] = useState('');

  return (
    <div className="panel">
      <h1>♞ Ajedrez 3D</h1>
      <span className="subtitulo">TPO Ingeniería de Software — UADE</span>
      {!id && (
        <div className="nombres">
          <input placeholder="Jugador blancas" value={blanco} onChange={(e) => setBlanco(e.target.value)} />
          <input placeholder="Jugador negras" value={negro} onChange={(e) => setNegro(e.target.value)} />
        </div>
      )}
      <button className="principal" onClick={() => despachar(crearPartida({ blanco, negro }))} disabled={cargando}>
        {!id ? 'Nueva partida' : 'Reiniciar partida'}
      </button>
      {id && !finalizada && (
        <button className="secundario" onClick={() => despachar(rendirse(id))} disabled={cargando}>
          Rendirse
        </button>
      )}
      <div className="perspectivas">
        <span className="etiqueta">Cámara</span>
        {Object.entries(PERSPECTIVAS).map(([clave, { etiqueta }]) => (
          <button
            key={clave}
            className={perspectiva === clave ? 'activo' : ''}
            onClick={() => despachar(cambiarPerspectiva(clave))}
          >
            {etiqueta.replace('Vista ', '')}
          </button>
        ))}
      </div>
      {id && (
        <div className="estado">
          <p className="turno">
            Turno: <strong>{turno === 'w' ? 'Blancas' : 'Negras'}</strong>
            {enJaque && <span className="jaque"> ¡Jaque!</span>}
          </p>
          {jugadores?.blanco || jugadores?.negro ? (
            <p className="jugadores">
              {jugadores.blanco || 'Blancas'} vs {jugadores.negro || 'Negras'}
            </p>
          ) : null}
        </div>
      )}
      {finalizada && (
        <div className="fin">
          <p>🏁 Partida finalizada</p>
          {resultado && <p className="resultado">{resultado}</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
