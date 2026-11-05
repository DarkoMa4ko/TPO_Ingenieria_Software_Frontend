import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rendirse, cambiarPerspectiva } from '../store/partidaSlice.js';
import { PERSPECTIVAS } from './perspectivas.js';
import Historial from './Historial.jsx';
import { IconoBandera, IconoMas, IconosCamara } from './Iconos.jsx';

// Sección "partida" del panel lateral: jugadas, cámara y acciones.
export default function SeccionPartida({ onNueva }) {
  const {
    id, finalizada, resultado, cargando, error, perspectiva, lado,
  } = useSelector((s) => s.partida);
  const despachar = useDispatch();
  const [confirmar, setConfirmar] = useState(false);
  // En la cenital también queda marcado el lado desde el que se mira.
  const activa = (clave) => (clave === 'blancas' || clave === 'negras'
    ? lado === clave && !PERSPECTIVAS[perspectiva]?.lateral
    : perspectiva === clave);

  return (
    <>
      {finalizada && resultado && <p className="panel-resultado">{resultado}</p>}

      <Historial />

      <div className="panel-seccion">
        <span className="panel-etiqueta">Cámara</span>
        <div className="camaras" role="group" aria-label="Perspectiva de cámara">
          {Object.entries(PERSPECTIVAS).map(([clave, { etiqueta, tecla }]) => {
            const Icono = IconosCamara[clave];
            return (
              <button
                key={clave}
                type="button"
                className={activa(clave) ? 'activo' : ''}
                aria-pressed={activa(clave)}
                onClick={() => despachar(cambiarPerspectiva(clave))}
                title={`${etiqueta} (${tecla})`}
              >
                <Icono />
                <span>{etiqueta}</span>
                <kbd>{tecla}</kbd>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel-acciones">
        {!finalizada && (
          confirmar ? (
            <div className="confirmar" role="group" aria-label="Confirmar rendición">
              <span>¿Rendirse?</span>
              <button type="button" className="boton-peligro" disabled={cargando} onClick={() => { setConfirmar(false); despachar(rendirse(id)); }}>
                Sí, rendirse
              </button>
              <button type="button" className="boton-linea chico" onClick={() => setConfirmar(false)}>No</button>
            </div>
          ) : (
            <button type="button" className="boton-linea" onClick={() => setConfirmar(true)} disabled={cargando}>
              <IconoBandera /> Rendirse
            </button>
          )
        )}
        <button type="button" className="boton-oro chico" onClick={onNueva} disabled={cargando}>
          <IconoMas /> Nueva partida
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
