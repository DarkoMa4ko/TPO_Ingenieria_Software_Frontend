import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import EscenaAjedrez from './three/EscenaAjedrez.jsx';
import PanelPartida from './ui/PanelPartida.jsx';
import Historial from './ui/Historial.jsx';
import ModalPromocion from './ui/ModalPromocion.jsx';
import ModalResultado from './ui/ModalResultado.jsx';
import { crearPartida } from './store/partidaSlice.js';
import { reproducirSonido } from './utils/sonidos.js';
import { hayJaqueEnFen } from './utils/jaque.js';

export default function App() {
  const { id, fen, jugadas, enJaque, finalizada, resultado, cargando, error } = useSelector((s) => s.partida);
  const despachar = useDispatch();
  const [pantalla, setPantalla] = useState('inicio');
  const [blanco, setBlanco] = useState('');
  const [negro, setNegro] = useState('');
  const [validacionIntentada, setValidacionIntentada] = useState(false);
  const [sonido, setSonido] = useState(() => localStorage.getItem('ajedrez-sonido') !== 'off');
  const anterior = useRef({ id: null, cantidad: 0, finalizada: false });
  const [resultadoOcultoPara, setResultadoOcultoPara] = useState(null);

  useEffect(() => {
    const previo = anterior.current;
    const esMismaPartida = Boolean(id && id === previo.id);
    const hayJugadaNueva = esMismaPartida && jugadas.length > previo.cantidad;
    const acabaDeFinalizar = esMismaPartida && finalizada && !previo.finalizada;

    // Un solo sonido por actualización: mate > tablas/final > jaque > captura > movimiento.
    if (hayJugadaNueva || acabaDeFinalizar) {
      const ultima = jugadas[jugadas.length - 1];
      const esTablas = /tabla|empate|ahogado|stalemate|draw/i.test(resultado || '');
      const esMate = /jaque[\s-]*mate|checkmate|mate/i.test(resultado || '');
      const esJaque = enJaque || hayJaqueEnFen(fen);
      if (acabaDeFinalizar) {
        reproducirSonido(esTablas ? 'tablas' : esMate ? 'jaqueMate' : 'final');
      } else if (esJaque) {
        reproducirSonido('jaque');
      } else {
        reproducirSonido(ultima?.captura || /x/.test(ultima?.notacion || '') ? 'captura' : 'mover');
      }
    }
    anterior.current = { id, cantidad: jugadas.length, finalizada };
  }, [id, jugadas, enJaque, fen, finalizada, resultado]);

  const cerrarResultado = () => setResultadoOcultoPara(id);
  function nuevaPartida() {
    setResultadoOcultoPara(null);
    setPantalla('inicio');
  }

  function comenzar(e) {
      // Evita que se recargue la página al enviar el formulario
    e.preventDefault();
    // Activa la validación de los campos
    setValidacionIntentada(true);
    // Elimina los espacios al principio y al final de los nombres
    const nombreBlanco = blanco.trim();
    const nombreNegro = negro.trim();

    // Si alguno de los nombres está vacío, no deja crear la partida
    if (!nombreBlanco || !nombreNegro){
        return;
    }

    //Envía los nombres al backend para crear la partida
    despachar(crearPartida({
        blanco: nombreBlanco,
        negro: nombreNegro })).unwrap()
      .then(() => {
          // Si se crea correctamente, se muestra el tablero
          setResultadoOcultoPara(null);
          setPantalla('partida');
          setValidacionIntentada(false);})
      .catch(() => {
          // Si falla la creación, no cambia la pantalla
          });
  }
  function alternarSonido() {
    localStorage.setItem('ajedrez-sonido', sonido ? 'off' : 'on');
    setSonido(!sonido);
  }

  return (
    <div className="app-shell">
      <header className="barra-superior">
        <div className="marca" onClick={() => setPantalla('inicio')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPantalla('inicio')}>
          <span className="marca-icono">♞</span><span>AJEDREZ <b>3D</b><small>INGENIERÍA DE SOFTWARE · UADE</small></span>
        </div>
        <div className="acciones-superiores">
          <button className="boton-discreto" onClick={alternarSonido} aria-label={sonido ? 'Silenciar sonidos' : 'Activar sonidos'}>{sonido ? '♪ Sonido activado' : '♩ Sin sonido'}</button>
          {id && <button className="boton-discreto" onClick={() => setPantalla(pantalla === 'partida' ? 'inicio' : 'partida')}>{pantalla === 'partida' ? '← Menú' : 'Continuar partida →'}</button>}
        </div>
      </header>
      {pantalla === 'inicio' ? (
        <main className="bienvenida">
          <div className="bienvenida-contenido">
            <div className="intro-label">♟ EL JUEGO DE ESTRATEGIA DEFINITIVO</div>
            <h1>Una partida.<br /><em>Infinitas posibilidades.</em></h1>
            <p>Desafiá a un amigo en una experiencia de ajedrez 3D. Pensá cada jugada, elegí tu perspectiva y disfrutá el juego.</p>
            <form className="form-inicio" onSubmit={comenzar}>
              <h2>Crear nueva partida</h2>
              <div className="campos-jugadores">
                <label><span>♔ Jugador de blancas</span>
                       <input value={blanco} onChange={e => setBlanco(e.target.value)} maxLength={60} placeholder="Nombre del jugador" aria-invalid={validacionIntentada && !blanco.trim()}/>
                       {/*Muestra el mensaje si el nombre está vacío */}
                       {validacionIntentada && !blanco.trim() && (
                            <span className="mensaje-validacion">Introduce el nombre del jugador de blancas.</span>
                       )}
                </label>
                <label>
                    <span>♚ Jugador de negras</span>
                    <input value={negro} onChange={e => setNegro(e.target.value)} maxLength={60} placeholder="Nombre del jugador"aria-invalid={validacionIntentada && !blanco.trim()} />
                    {/*Muestra el mensaje si el nombre está vacío */}
                    {validacionIntentada && !blanco.trim() && (
                            <span className="mensaje-validacion">Introduce el nombre del jugador de negras.</span>
                    )}
                </label>
              </div>
              <button type="submit" className="principal grande" disabled={cargando}>{cargando ? 'Creando partida…' : 'Comenzar partida →'}</button>
              {id && <button type="button" className="secundario" onClick={() => setPantalla('partida')}>Continuar partida actual</button>}
              {error && <p className="error" role="alert">{error}</p>}
            </form>
          </div>
          <div className="bienvenida-decoracion" aria-hidden="true"><span>♚</span><span>♞</span><span>♜</span></div>
        </main>
      ) : (
        <main className="app">
          <section className="escena" aria-label="Tablero de ajedrez 3D">{fen && <EscenaAjedrez />}</section>
          <aside className="lateral">
            <PanelPartida onNueva={nuevaPartida} />
            {id && <Historial jugadas={jugadas} />}
          </aside>
        </main>
      )}
      <ModalPromocion />
      {pantalla === 'partida' && finalizada && id !== resultadoOcultoPara && (
        <ModalResultado resultado={resultado} onCerrar={cerrarResultado} onNueva={nuevaPartida} />
      )}
    </div>
  );
}
