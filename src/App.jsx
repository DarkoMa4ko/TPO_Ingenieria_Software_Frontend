import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import EscenaAjedrez from './three/EscenaAjedrez.jsx';
import Menu from './ui/Menu.jsx';
import Hud from './ui/Hud.jsx';
import BarraSuperior from './ui/BarraSuperior.jsx';
import Cargador from './ui/Cargador.jsx';
import useSalida from './ui/useSalida.js';
import PanelLateral from './ui/PanelLateral.jsx';
import Franjas from './ui/Franjas.jsx';
import AvisoJaque from './ui/AvisoJaque.jsx';
import ModalPromocion from './ui/ModalPromocion.jsx';
import ModalResultado from './ui/ModalResultado.jsx';
import { alternarPanel, cambiarPerspectiva } from './store/partidaSlice.js';
import { PERSPECTIVAS } from './ui/perspectivas.js';
import { esTablas } from './utils/resultado.js';

const ATAJOS_PERSPECTIVA = Object.fromEntries(
  Object.entries(PERSPECTIVAS).map(([clave, { tecla }]) => [tecla, clave]),
);

export default function App() {
  const { id, finalizada, resultado, promoverDe, cinematica, panelOculto } = useSelector((s) => s.partida);
  const despachar = useDispatch();
  const [pantalla, setPantalla] = useState('inicio');
  const [resultadoOcultoPara, setResultadoOcultoPara] = useState(null);
  const [resultadoVisible, setResultadoVisible] = useState(false);
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  // La interfaz aparece cuando el cargador termina de revelar la escena.
  const [introLista, setIntroLista] = useState(false);

  const enPartida = pantalla === 'partida' && id;

  // Un solo panel lateral, con la partida o los ajustes. El engranaje prende y
  // apaga los ajustes (al apagarlos vuelve lo que había); el botón del panel
  // muestra u oculta la partida, y si estaban los ajustes, cambia a la partida.
  const seccion = ajustesAbiertos ? 'ajustes' : enPartida && !panelOculto ? 'partida' : null;
  const alternarAjustes = () => setAjustesAbiertos((abiertos) => !abiertos);
  const alternarSeccionPartida = () => {
    if (!ajustesAbiertos) {
      despachar(alternarPanel());
      return;
    }
    setAjustesAbiertos(false);
    if (panelOculto) despachar(alternarPanel());
  };

  // Escape cierra los ajustes (también en el inicio).
  useEffect(() => {
    if (!ajustesAbiertos || enPartida) return undefined;
    const alPresionarTecla = (evento) => { if (evento.key === 'Escape') setAjustesAbiertos(false); };
    window.addEventListener('keydown', alPresionarTecla);
    return () => window.removeEventListener('keydown', alPresionarTecla);
  }, [ajustesAbiertos, enPartida]);

  useEffect(() => {
    if (!enPartida || resultadoVisible || promoverDe) return undefined;

    const alPresionarTecla = (evento) => {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      const objetivo = evento.target;
      const etiqueta = objetivo?.tagName;
      if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT' || objetivo?.isContentEditable) return;
      if (evento.key === 'Escape') {
        if (ajustesAbiertos) setAjustesAbiertos(false);
        else salirAlInicio();
        return;
      }
      if (evento.key === 'p' || evento.key === 'P') {
        evento.preventDefault();
        alternarSeccionPartida();
        return;
      }
      const destino = ATAJOS_PERSPECTIVA[evento.key];
      if (!destino) return;
      evento.preventDefault();
      despachar(cambiarPerspectiva(destino));
    };

    window.addEventListener('keydown', alPresionarTecla);
    return () => window.removeEventListener('keydown', alPresionarTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enPartida, resultadoVisible, promoverDe, ajustesAbiertos, panelOculto, despachar]);

  // El resultado aparece cuando termina la cinemática final (rey derribado).
  // Las tablas no tienen cinemática; si algo falla, un tope de 9 s lo muestra igual.
  const vioCinematicaFinal = useRef(null);
  if (cinematica?.tipo === 'mate') vioCinematicaFinal.current = id;

  useEffect(() => {
    if (pantalla !== 'partida' || !finalizada || id === resultadoOcultoPara) {
      setResultadoVisible(false);
      return undefined;
    }
    if (cinematica) return undefined;
    const listo = esTablas(resultado) || vioCinematicaFinal.current === id;
    const temporizador = setTimeout(() => setResultadoVisible(true), listo ? 900 : 9000);
    return () => clearTimeout(temporizador);
  }, [pantalla, finalizada, id, resultadoOcultoPara, cinematica, resultado]);

  const cerrarResultado = () => setResultadoOcultoPara(id);

  // Salir al inicio cierra todo lo de la partida, ajustes incluidos.
  function salirAlInicio() {
    setAjustesAbiertos(false);
    setPantalla('inicio');
  }

  function irAlMenu() {
    setResultadoOcultoPara(id);
    salirAlInicio();
  }

  const hud = useSalida(Boolean(enPartida));
  const verResultado = useSalida(Boolean(enPartida && resultadoVisible && id !== resultadoOcultoPara));
  const panel = useSalida(Boolean(seccion && introLista));
  // Mientras se va, el panel sigue mostrando la última sección.
  const ultimaSeccion = useRef(seccion);
  if (seccion) ultimaSeccion.current = seccion;
  // Al entrar a la partida, el panel espera a que se arme el tablero; abierto con
  // su botón, aparece enseguida.
  const estabaEnPartida = useRef(false);
  const entrandoAPartida = Boolean(enPartida) && !estabaEnPartida.current;
  useEffect(() => { estabaEnPartida.current = Boolean(enPartida); });

  return (
    <div className={`app-shell ${enPartida ? 'modo-partida' : 'modo-menu'} ${enPartida && cinematica ? 'en-cinematica' : ''}`}>
      <div className="lienzo" aria-label="Tablero de ajedrez 3D" role="img">
        <EscenaAjedrez modo={enPartida ? 'juego' : 'menu'} panelAbierto={Boolean(seccion)} />
      </div>
      <div className="velo" aria-hidden="true" />

      {introLista && (
        <BarraSuperior
          seccion={seccion}
          onPanel={alternarSeccionPartida}
          onAjustes={alternarAjustes}
          enPartida={Boolean(enPartida)}
          onMenu={salirAlInicio}
        />
      )}

      {hud.montado && <Hud saliendo={hud.saliendo} />}
      {panel.montado && (
        <PanelLateral
          seccion={seccion ?? ultimaSeccion.current}
          saliendo={panel.saliendo}
          retraso={entrandoAPartida && seccion === 'partida' ? 1.75 : 0}
          onNueva={irAlMenu}
        />
      )}
      {!enPartida && introLista && (
        <Menu
          onComenzar={() => {
            setResultadoOcultoPara(null);
            setPantalla('partida');
          }}
          onContinuar={() => setPantalla('partida')}
        />
      )}

      {enPartida && <AvisoJaque />}
      <Franjas activa={Boolean(enPartida && cinematica)} texto={cinematica?.texto} sub={cinematica?.sub} tipo={cinematica?.tipo} />
      <ModalPromocion />
      {verResultado.montado && (
        <ModalResultado onCerrar={cerrarResultado} onNueva={irAlMenu} saliendo={verResultado.saliendo} />
      )}
      <Cargador onFin={() => setIntroLista(true)} />
    </div>
  );
}
