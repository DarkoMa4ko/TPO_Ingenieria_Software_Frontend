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

  /*Controla si se muestra la confirmación para reiniciar*/
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);

  //Controla si aparece la confirmación para rendirse
  const [confirmarRendicion, setConfirmarRendicion] = useState(false);

  return (
    <div className="panel">
      {!id && (
        <div className="nombres">
          <input placeholder="Jugador blancas" value={blanco} onChange={(e) => setBlanco(e.target.value)} />
          <input placeholder="Jugador negras" value={negro} onChange={(e) => setNegro(e.target.value)} />
        </div>
      )}
    {/*Botones de control de la partida*/}
    {id && (
      <div className="acciones-partida">
          <button className="principal boton-reiniciar" onClick={() => setConfirmarReinicio(true)} disabled={cargando}>
              Reiniciar partida
          </button>
          {!finalizada && (
              <button className="secundario" onClick={() => setConfirmarRendicion(true)} disabled ={cargando}>
                  Rendirse
              </button>
          )}
      </div>
    )}
      {/*Ventana para confirmar el reinicio */}
      {confirmarReinicio && (
        <div className ="modal-fondo">
            <div className ="modal">
                <h2>¿Reiniciar partida?</h2>
                <p>
                    Se perderán las jugadas de la partida actual.{' '}
                    ¿Seguro que quieres empezar de nuevo?
                </p>

                <div className="opciones">
                    {/*Cierra la ventana sin reiniciar*/}
                    <button className="secundario" onClick={() => setConfirmarReinicio(false)}>
                        Cancelar
                    </button>
                    {/* Reinicia manteniendo los nombres de los jugadores */}
                    <button className="principal" disabled ={cargando} onClick={async () => {try { await despachar(crearPartida
                        ({blanco: jugadores?.blanco || `Blancas`, negro: jugadores?.negro || `Negras`})).unwrap();
                            setConfirmarReinicio(false);
                        } catch {
                            //Si falla, no se cierra la ventana
                        }
                        }}
                    >
                        Sí, reiniciar
                    </button>
                </div>
            </div>
        </div>
      )}




      {/*ventana de confirmación para rendirse */}
      {confirmarRendicion && (
        <div className="modal-fondo">
            <div className="modal">
                <h2> ¿Seguro que quieres rendirte?</h2>
                <p>
                    Si te rindes, la partida terminará y{' '}
                    tu rival será declarado ganador.
                </p>

                <div className="opciones">
                    {/* Volver a la partida */}
                    <button className="secundario" onClick={() => setConfirmarRendicion(false)}>
                        Cancelar
                    </button>

                    {/*Confirmar la rendición*/}
                    <button className="principal" disabled={cargando} onClick={async () => {try{
                        await despachar(rendirse(id)).unwrap(); setConfirmarRendicion(false);
                        } catch {
                            //Si falla, mantenemos la ventana abierta
                        }
                    }}
                >
                    Sí, rendirse
                </button>
            </div>
        </div>
      </div>

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
      {/* Información de la partida y de los jugadores */}
      {id && (
        <div className="estado">
            {/* Muestra a quién le toca mover*/}
          <p className="turno">
              {finalizada ? (
                <strong>Partida finalizada </strong>
                ) : (
                    <>
                       <strong>Turno: </strong>
                       <span className="color-turno">{turno === 'w' ? 'Blancas' : 'Negras'}</span>
                       {enJaque && <span className="jaque"> ¡Jaque!</span>}
                    </>
                )}
          </p>
          {/* Tarjeta de los jugadores */}
          <div className = "tarjetas-jugadores">
              {/* Jugador de blancas */}
              <div className={`tarjeta-jugador ${turno === 'w' && !finalizada ? 'jugador-activo' : ''}`}>
                  <span className ="tipo-jugador"> ♔ PIEZAS BLANCAS</span>
                  <strong>{jugadores?.blanco || 'Blancas'}</strong>
                  {turno === 'w' && !finalizada && (
                      <span className="indicador-turno"> ● Su turno</span>
                  )}
              </div>
              {/*Jugador de negras */}
              <div className={`tarjeta-jugador ${turno === 'b' && !finalizada ? 'jugador-activo' : ''}`}>
                  <span className ="tipo-jugador"> ♚ PIEZAS NEGRAS</span>
                  <strong>{jugadores?.negro || 'Negras'}</strong>
                  {turno === 'b' && !finalizada && (
                      <span className="indicador-turno"> ● Su turno</span>
                  )}
              </div>
          </div>
        </div>
      )}
      {finalizada && (
        <div className="fin">
          <p>🏁 Estado de la partida</p>
          {resultado && <p className="resultado">{resultado}</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
