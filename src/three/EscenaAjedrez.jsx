import { Suspense, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useDispatch, useSelector } from 'react-redux';
import {
  Environment,
  Lightformer,
  OrbitControls,
  SoftShadows,
  Sparkles,
} from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { parseFen, casillaOffset } from '../utils/fen.js';
import { casillaReyEnJaque } from '../utils/jaque.js';
import {
  capturaDeJugada,
  capturasDeJugadas,
  movimientosDeJugada,
  FEN_INICIAL,
} from '../utils/capturas.js';
import {
  seleccionar,
  deseleccionar,
  jugar,
  setearPromocion,
  fijarCinematica,
} from '../store/partidaSlice.js';
import { esMate, esTablas, ganador } from '../utils/resultado.js';
import { nombreJugador } from '../utils/jugadores.js';
import Pieza, { PiezaModelo } from './Piezas.jsx';
import PiezaAnimada, { suave } from './PiezaAnimada.jsx';
import Tablero, { BANDEJA_X, FIELTRO_Y } from './Tablero.jsx';
import Mesa, { ESTILOS_MESA, MEDIDAS_CASCADA, MEDIDAS_MESA, dispararOnda } from './Mesa.jsx';
import LogoInicio from './LogoInicio.jsx';
import ZoomSuave from './ZoomSuave.jsx';
import CieloMagico, { DIRECCION_LUNA, texturaLuna } from './CieloMagico.jsx';
import Lago, { NIVEL_AGUA, NIVEL_CASCADA } from './Lago.jsx';
import Fuegos from './Fuegos.jsx';
import { COLORES, anunciar } from './CartelAnuncios.jsx';
import Resaltados from './Resaltados.jsx';
import Impactos from './Impactos.jsx';
import DirectorCamara from './DirectorCamara.jsx';
import Efectos from './Efectos.jsx';
import { ProveedorReloj, camaraLenta, useReloj } from './Reloj.jsx';
import {
  PLANO_NEUTRO, RELOJ_HOLO, aplicarIntro, crearMaterialHolo, iniciarIntroHolograma, iniciarSalidaHolograma, ocultarIntro,
} from './holograma.js';

const DURACION_MOVIMIENTO = 0.62;
const DURACION_ATAQUE = 0.9;
const DURACION_VUELO_CAPTURA = 1.45;
const OBJETIVO_ORBITA = [0, -0.2, 0];
const NOMBRES = { p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' };

// Lo que el cartel del borde anuncia de una jugada (capturas, enroque, coronación y
// jaque), siempre con el nombre de quien la hizo.
function anunciarJugada({ capturada, movimientos, jugada, jaque, finalizada, jugadores }) {
  const blanco = movimientos[0]?.blanco ?? true;
  const quien = nombreJugador(jugadores, blanco).toUpperCase();
  const rival = nombreJugador(jugadores, !blanco).toUpperCase();
  const partes = [];
  let alerta = null;
  if (capturada) {
    partes.push([`${NOMBRES[capturada.atacante]} DE ${quien} CAPTURA ${NOMBRES[capturada.tipo]} DE ${rival}`.toUpperCase(), COLORES.rojo]);
    alerta = COLORES.rojo;
  } else if (movimientos.length === 2) {
    partes.push([`${quien} ENROCA`, COLORES.celeste]);
  }
  const corona = jugada.notacion?.length > 4 ? jugada.notacion[4].toLowerCase() : null;
  if (NOMBRES[corona]) {
    partes.push([`PEÓN DE ${quien} CORONA ${NOMBRES[corona].toUpperCase()}`, COLORES.oro]);
    alerta ??= COLORES.oro;
  }
  if (jaque && !finalizada) {
    partes.push([`¡${quien} DA JAQUE!`, COLORES.ambar]);
    alerta ??= COLORES.ambar;
  }
  if (partes.length) anunciar(partes, { alerta });
}

// Fin de partida: queda en el cartel, con el degradé del festejo, hasta la próxima.
function anunciarFinal(resultado, turno, jugadores) {
  const detalle = (resultado || '').split(':')[1]?.replace(/\(tablas\)/i, '').trim();
  let titulo = (resultado || 'Fin de la partida').toUpperCase();
  if (esMate(resultado)) titulo = '¡JAQUE MATE!';
  else if (esTablas(resultado)) titulo = detalle ? `TABLAS · ${detalle.toUpperCase()}` : 'TABLAS';
  const partes = [[titulo, COLORES.fiesta]];
  const gana = ganador(resultado, turno);
  if (gana) partes.push([`GANA ${nombreJugador(jugadores, gana === 'w').toUpperCase()} CON ${gana === 'w' ? 'BLANCAS' : 'NEGRAS'}`, COLORES.blanco]);
  anunciar(partes, { duracion: Infinity, alerta: esMate(resultado) ? COLORES.rojo : null });
}
// Distancia entre centros a la que las bases de dos piezas se tocan.
const CONTACTO = 0.66;

// Momento (0..1 del movimiento de la atacante) en que alcanza a la víctima.
function instanteDeContacto(desde, hasta, victima) {
  const a = casillaOffset(desde);
  const h = casillaOffset(hasta);
  const v = casillaOffset(victima);
  for (let t = 0; t <= 1; t += 0.01) {
    const e = suave(t);
    if (Math.hypot(a.x + (h.x - a.x) * e - v.x, a.z + (h.z - a.z) * e - v.z) < CONTACTO) return t;
  }
  return 0.9;
}

export function posicionCaptura(blanco, indice) {
  const lado = blanco ? -1 : 1;
  const columna = Math.floor(indice / 8);
  const fila = indice % 8;
  return [lado * BANDEJA_X + (columna - 0.5) * 0.8, FIELTRO_Y, (fila - 3.5) * 0.98 * -lado];
}

function Bandejas({ capturas, ocultarUltima }) {
  const visibles = ocultarUltima ? capturas.slice(0, -1) : capturas;
  const contadores = { w: 0, b: 0 };
  return visibles.map((captura) => {
    const clave = captura.blanco ? 'w' : 'b';
    const indice = contadores[clave];
    contadores[clave] += 1;
    return (
      <group key={captura.orden} position={posicionCaptura(captura.blanco, indice)}>
        <PiezaModelo tipo={captura.tipo} blanco={captura.blanco} semilla={captura.casilla} />
      </group>
    );
  });
}

// Rey derribado al final de la partida.
function ReyCaido({ pieza, direccion }) {
  const ref = useRef(null);
  const reloj = useReloj();
  const inicio = useRef(null);
  const { x, z } = casillaOffset(pieza.casilla);

  useFrame(() => {
    if (!ref.current) return;
    if (inicio.current == null) inicio.current = reloj.current.t + 0.5;
    const t = Math.max(0, Math.min(1, (reloj.current.t - inicio.current) / 0.95));
    // Cae acelerando y rebota dos veces antes de quedar quieto.
    const caida = t < 0.7 ? Math.pow(t / 0.7, 2.2) : 1 - Math.abs(Math.sin(((t - 0.7) / 0.3) * Math.PI * 2)) * 0.08 * (1 - (t - 0.7) / 0.3);
    const angulo = caida * (Math.PI / 2 - 0.07);
    ref.current.rotation.set(direccion[1] * angulo, 0, -direccion[0] * angulo);
    ref.current.position.set(x, 0.002 + Math.sin(angulo) * 0.3, z);
  }, -1);

  return (
    <group ref={ref} position={[x, 0.002, z]}>
      <PiezaModelo tipo="k" blanco={pieza.blanco} semilla={pieza.casilla} />
    </group>
  );
}

// Monta un momento cada shader de efectos fuera de la vista para que se compilen
// al cargar y no frenen la primera captura o el primer jaque.
const CAPTURA_FALSA = new Set(['e5']);
const HOLO_PRECALENTAR = crearMaterialHolo({ planos: [PLANO_NEUTRO, PLANO_NEUTRO] });
const GEOMETRIA_PRECALENTAR = new THREE.BoxGeometry(1, 1, 1);
function Precalentar() {
  const [vivo, setVivo] = useState(true);
  useEffect(() => {
    const temporizador = setTimeout(() => setVivo(false), 2500);
    return () => clearTimeout(temporizador);
  }, []);
  if (!vivo) return null;
  return (
    <group position={[0, -3, 0]} scale={0.0001}>
      <Resaltados seleccion="d4" destinos={['e4', 'e5']} capturas={CAPTURA_FALSA} jaque="h8" hover="b2" />
      <Impactos lista={[{ id: -1, posicion: [0, 0, 0], fuerza: 1 }]} onFin={() => {}} />
      <lineSegments material={HOLO_PRECALENTAR}>
        <edgesGeometry args={[GEOMETRIA_PRECALENTAR]} />
      </lineSegments>
    </group>
  );
}

// Haz de escaneo que acompaña el barrido del holograma.
const vertexHaz = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const fragmentHaz = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFuerza;
  varying vec2 vUv;
  void main() {
    float borde = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float a = (exp(-vUv.y * 5.0) * 0.55 + smoothstep(0.02, 0.0, vUv.y) * 1.5) * borde * uFuerza;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

function crearHaz(color) {
  return new THREE.ShaderMaterial({
    vertexShader: vertexHaz,
    fragmentShader: fragmentHaz,
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(2.2) }, uFuerza: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function ControlHolograma() {
  const frente = useRef(null);
  const cola = useRef(null);
  const materiales = useMemo(() => ({ frente: crearHaz('#5fe3ff'), cola: crearHaz('#e8fbff') }), []);
  useFrame(({ clock }) => {
    RELOJ_HOLO.uTiempo.value = clock.elapsedTime;
    const estado = aplicarIntro(clock.elapsedTime);
    // Los haces quedan montados (dos quads, sin costo) para no compilar su shader en plena intro.
    if (!estado) {
      materiales.frente.uniforms.uFuerza.value = 0;
      materiales.cola.uniforms.uFuerza.value = 0;
      return;
    }
    const fuerza = Math.min(1, Math.max(0, estado.k) * 6) * (1 - Math.max(0, estado.k - 0.85) / 0.4);
    frente.current.position.z = estado.frenteZ;
    cola.current.position.z = estado.colaZ;
    materiales.frente.uniforms.uFuerza.value = fuerza;
    materiales.cola.uniforms.uFuerza.value = fuerza * 0.55;
  });
  return (
    <>
      <mesh ref={frente} material={materiales.frente} position={[0, 1.05, 30]} raycast={() => null} renderOrder={4}>
        <planeGeometry args={[17.5, 3, 1, 1]} />
      </mesh>
      <mesh ref={cola} material={materiales.cola} position={[0, 1.05, 30]} raycast={() => null} renderOrder={4}>
        <planeGeometry args={[17.5, 3, 1, 1]} />
      </mesh>
    </>
  );
}

// Fondo, cielo y polvo en suspensión. Memorizado: no depende de la partida.
const ESCALA_POLVO = [16, 7, 16];
const POSICION_POLVO = [0, 3, 0];
const Ambiente = memo(function Ambiente({ calidad, colorMesa, cascada }) {
  return (
    <>
      <Lago
        calidad={calidad}
        direccionLuna={DIRECCION_LUNA}
        colorMesa={colorMesa}
        medidasMesa={cascada ? MEDIDAS_CASCADA : MEDIDAS_MESA}
        nivel={cascada ? NIVEL_CASCADA : NIVEL_AGUA}
        cascada={cascada}
      />
      <color attach="background" args={['#010103']} />
      <CieloMagico calidad={calidad} />
      <Sparkles count={40} scale={ESCALA_POLVO} position={POSICION_POLVO} size={1.6} speed={0.18} opacity={0.22} color="#ffdcae" noise={0.6} />
    </>
  );
});

const POSICION_LUNA_ENTORNO = DIRECCION_LUNA.clone().multiplyScalar(13).toArray();
const TEXTURA_LUNA = texturaLuna();

// Luces y entorno de estudio. Memorizado a propósito: <Environment> vuelve a
// renderizar su cubemap cada vez que cambian sus hijos, y eso trababa cada jugada.
const Iluminacion = memo(function Iluminacion({ calidad }) {
  return (
    <>
      <SoftShadows size={22} samples={calidad === 'alta' ? 10 : 6} focus={0.6} />

      <ambientLight intensity={0.05} />
      <spotLight
        castShadow
        position={[3.5, 15, 6.5]}
        angle={0.56}
        penumbra={0.85}
        intensity={720}
        decay={2}
        color="#ffe3c2"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00012}
        shadow-normalBias={0.025}
        shadow-camera-near={6}
        shadow-camera-far={30}
      />
      <directionalLight position={[-5, 6, -12]} intensity={0.85} color="#b4c4ff" />
      <directionalLight position={[10, 4, 2]} intensity={0.25} color="#ffd9b0" />

      <Environment resolution={512} frames={1} environmentIntensity={0.85}>
        {/* Dos tiras cenitales: en el vidrio negro y el mármol dejan reflejos nítidos, no un velo gris. */}
        <Lightformer form="rect" intensity={4} color="#fff1dc" position={[-2.6, 9, 1]} rotation-x={Math.PI / 2} scale={[1.3, 9, 1]} />
        <Lightformer form="rect" intensity={4} color="#fff1dc" position={[2.6, 9, 1]} rotation-x={Math.PI / 2} scale={[1.3, 9, 1]} />
        <Lightformer form="rect" intensity={3.2} color="#ffe6c4" position={[-9, 3.5, 2]} rotation-y={Math.PI / 2} scale={[1.2, 8, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#dfe8ff" position={[9, 3.5, -1]} rotation-y={-Math.PI / 2} scale={[1.2, 8, 1]} />
        <Lightformer form="rect" intensity={0.85} color="#c9d6ff" position={[0, 4, -12]} scale={[14, 1.4, 1]} />
        {/* La luna como disco de luz: en el vidrio negro y el mármol se refleja una luna, no un aro. */}
        <Lightformer form="circle" intensity={1.4} color="#eef2ff" map={TEXTURA_LUNA} position={POSICION_LUNA_ENTORNO} target={[0, 0, 0]} scale={2.6} />
      </Environment>
    </>
  );
});

function Escena({ modo, enfoque, panelAbierto }) {
  const {
    id, fen: fenPartida, fenInicial, jugadas, finalizada, resultado, enJaque, cargando, legales, seleccion,
    promoverDe, perspectiva, lado, turno, jugadores,
  } = useSelector((s) => s.partida);
  const ajustes = useSelector((s) => s.ajustes);
  // Siempre con todos los efectos.
  const calidad = 'alta';
  const despachar = useDispatch();
  const reloj = useReloj();
  const enMenu = modo === 'menu';
  const fen = fenPartida || FEN_INICIAL;

  const [animacion, setAnimacion] = useState(null);
  const [cinematica, setCinematica] = useState(null);
  const [cinematicaActiva, setCinematicaActiva] = useState(false);
  const [impactos, setImpactos] = useState([]);
  const [hover, setHover] = useState(null);
  const [derribo, setDerribo] = useState(null);
  const seguimiento = useRef({ id: null, cantidad: 0, fen: null, finalizada: false });
  const pendientes = useRef(0);
  const controlesRef = useRef(null);
  const contadorImpactos = useRef(0);

  const piezas = useMemo(() => parseFen(fen), [fen]);
  const reyEnJaque = useMemo(() => (enMenu ? null : casillaReyEnJaque(fen, enJaque)), [fen, enJaque, enMenu]);
  const destinos = useMemo(
    () => (seleccion && !enMenu ? legales.filter((m) => m.desde === seleccion) : []),
    [seleccion, legales, enMenu],
  );
  const capturas = useMemo(
    () => (fenPartida ? capturasDeJugadas(jugadas, fenInicial || FEN_INICIAL) : []),
    [jugadas, fenInicial, fenPartida],
  );

  const agregarImpacto = useCallback((posicion, fuerza) => {
    contadorImpactos.current += 1;
    const nuevo = { id: contadorImpactos.current, posicion, fuerza };
    setImpactos((lista) => [...lista, nuevo]);
  }, []);
  const quitarImpacto = useCallback((idImpacto) => {
    setImpactos((lista) => (lista.some((i) => i.id === idImpacto) ? lista.filter((i) => i.id !== idImpacto) : lista));
  }, []);

  // En el inicio no hay tablero: al comenzar (o retomar) una partida, tablero y
  // piezas se materializan como holograma, y al volver al inicio se desarman.
  const veniaDeMenu = useRef(null);
  useLayoutEffect(() => {
    const previo = veniaDeMenu.current;
    veniaDeMenu.current = enMenu;
    if (enMenu) {
      if (previo === false) iniciarSalidaHolograma(RELOJ_HOLO.uTiempo.value);
      else ocultarIntro();
      return;
    }
    if (id) iniciarIntroHolograma(RELOJ_HOLO.uTiempo.value + 0.7);
  }, [id, enMenu]);

  // Detecta jugadas nuevas y arma la animación correspondiente.
  useLayoutEffect(() => {
    const previo = seguimiento.current;
    const mismaPartida = previo.id === id && id != null;
    const jugadaNueva = mismaPartida && jugadas.length === previo.cantidad + 1;
    const recienFinalizada = mismaPartida && finalizada && !previo.finalizada;

    if (jugadaNueva && previo.fen) {
      const ultimaJugada = jugadas[jugadas.length - 1];
      const movimientos = movimientosDeJugada(previo.fen, ultimaJugada);
      const capturadaBase = capturaDeJugada(previo.fen, ultimaJugada);
      let capturada = null;
      if (capturadaBase) {
        const indiceColor = capturas.filter((c) => c.blanco === capturadaBase.blanco).length - 1;
        const atacante = movimientos[0];
        const a = casillaOffset(atacante.desde);
        const v = casillaOffset(capturadaBase.casilla);
        const largo = Math.hypot(v.x - a.x, v.z - a.z) || 1;
        capturada = {
          ...capturadaBase,
          atacante: atacante.tipo,
          destino: posicionCaptura(capturadaBase.blanco, indiceColor),
          empuje: [(v.x - a.x) / largo, (v.z - a.z) / largo],
          contacto: instanteDeContacto(atacante.desde, atacante.hasta, capturadaBase.casilla),
        };
      }
      if (movimientos.length) {
        anunciarJugada({ capturada, movimientos, jugada: ultimaJugada, jaque: enJaque, finalizada, jugadores });
        pendientes.current = movimientos.length + (capturada ? 1 : 0);
        setAnimacion({ movimientos, capturada, clave: `${id}-${jugadas.length}`, jaque: enJaque, finalizada, resultado });
        if (capturada) {
          const { x, z } = casillaOffset(capturada.casilla);
          setCinematica({ tipo: 'captura', foco: [x, 0.45, z], clave: `${id}-${jugadas.length}` });
          despachar(fijarCinematica({
            tipo: 'captura',
            texto: `${NOMBRES[capturada.atacante]} captura ${NOMBRES[capturada.tipo].toLowerCase()}`,
            sub: nombreJugador(jugadores, movimientos[0].blanco),
          }));
        }
      }
    } else if (!mismaPartida || jugadas.length < previo.cantidad) {
      setAnimacion(null);
      setCinematica(null);
      setCinematicaActiva(false);
      setDerribo(null);
      pendientes.current = 0;
    }

    // Rendición (sin jugada nueva): el rey cae enseguida.
    if (recienFinalizada && !jugadaNueva && !esTablas(resultado)) iniciarDerribo();

    seguimiento.current = { id, cantidad: jugadas.length, fen, finalizada };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fen, jugadas, finalizada]);

  function iniciarDerribo() {
    const rey = piezas.find((p) => p.tipo === 'k' && p.blanco === (turno === 'w'));
    if (!rey) return;
    const direccion = rey.blanco ? [0.35, 0.94] : [-0.35, -0.94];
    setDerribo({ pieza: rey, direccion });
    const { x, z } = casillaOffset(rey.casilla);
    setCinematica({ tipo: 'mate', foco: [x + direccion[0] * 0.55, 0.35, z + direccion[1] * 0.55], clave: `mate-${id}` });
    const gana = ganador(resultado, turno);
    despachar(fijarCinematica({
      tipo: 'mate',
      texto: esMate(resultado) ? 'Jaque mate' : 'Fin de la partida',
      sub: gana ? `Gana ${nombreJugador(jugadores, gana === 'w')}` : null,
    }));
    camaraLenta(reloj, 0.35, 1.6);
  }

  function alTerminarPieza() {
    pendientes.current -= 1;
    if (pendientes.current > 0) return;
    const anim = animacion;
    setAnimacion(null);
    if (anim?.finalizada && !esTablas(anim.resultado)) iniciarDerribo();
  }

  // Contacto entre atacante y víctima: la única onda del tablero sale acá;
  // los movimientos sin captura no dejan onda.
  function alGolpear(posicion) {
    agregarImpacto(posicion, 1);
    dispararOnda(posicion[0], posicion[2]);
    camaraLenta(reloj, 0.28, 0.75);
  }

  const bloqueado = enMenu || !id || finalizada || cargando || promoverDe || animacion || cinematicaActiva;
  // Festejo (fuegos artificiales y LEDs con el degradé): desde que termina la
  // animación de la última jugada hasta que empieza otra partida.
  const festejo = finalizada && !enMenu && !animacion;

  // El resultado queda en el cartel del borde durante el festejo; después vuelve la publicidad.
  useEffect(() => {
    if (!festejo) return undefined;
    anunciarFinal(resultado, turno, jugadores);
    return () => anunciar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [festejo]);

  function alHacerClick(casilla) {
    if (bloqueado) return;
    const esDestino = destinos.find((m) => m.hasta === casilla);
    const esOrigenLegal = legales.some((m) => m.desde === casilla);
    if (esDestino) {
      if (destinos.filter((m) => m.hasta === casilla).some((m) => m.notacion.length > 4 || /=/.test(m.notacion))) {
        despachar(setearPromocion({ desde: seleccion, hasta: casilla }));
      } else {
        despachar(jugar({ id, desde: seleccion, hasta: casilla }));
      }
      return;
    }
    if (esOrigenLegal && casilla !== seleccion) {
      despachar(seleccionar(casilla));
      return;
    }
    despachar(deseleccionar());
  }

  // Referencia estable: Tablero está memorizado y su material reflectante es caro de rehacer.
  const clickRef = useRef(alHacerClick);
  clickRef.current = alHacerClick;
  const alHacerClickEstable = useCallback((casilla) => clickRef.current(casilla), []);

  const interactivas = useMemo(() => new Set(legales.map((m) => m.desde)), [legales]);
  const destinosSet = useMemo(() => new Set(destinos.map((m) => m.hasta)), [destinos]);
  const ocupadas = useMemo(() => new Set(piezas.map((p) => p.casilla)), [piezas]);
  const hoverValido = !bloqueado && hover && (interactivas.has(hover) || destinosSet.has(hover)) ? hover : null;

  useEffect(() => {
    document.body.style.cursor = hoverValido ? 'pointer' : '';
    return () => { document.body.style.cursor = ''; };
  }, [hoverValido]);

  const casillasAnimadas = new Set(animacion ? animacion.movimientos.map((m) => m.hasta) : []);
  if (derribo) casillasAnimadas.add(derribo.pieza.casilla);
  const piezasVisibles = piezas.filter((pieza) => !casillasAnimadas.has(pieza.casilla));
  // Las mesas con pozo llevan siempre la cascada: el lago se vuelca adentro.
  const cascada = Boolean(ESTILOS_MESA[ajustes.mesa]);

  return (
    <>
      <Ambiente calidad={calidad} colorMesa={ESTILOS_MESA[ajustes.mesa]?.luz ?? '#9fb2d8'} cascada={cascada} />
      <Iluminacion calidad={calidad} />

      <Suspense fallback={null}>
        <Tablero estilo={ajustes.tablero} interactivo={!bloqueado} onCasilla={alHacerClickEstable} onHover={setHover} />
        <Mesa estilo={ajustes.mesa} tablero={ajustes.tablero} cascada={cascada} calidad={calidad} fiesta={festejo} />
        <LogoInicio />

        {piezasVisibles.map((pieza) => (
          <Pieza
            key={pieza.id}
            pieza={pieza}
            seleccionada={pieza.casilla === seleccion && !enMenu}
            resaltada={pieza.casilla === hoverValido}
            onClick={bloqueado ? undefined : alHacerClickEstable}
            onHover={bloqueado ? undefined : setHover}
          />
        ))}

        {animacion?.movimientos.map((movimiento, indice) => (
          <PiezaAnimada
            key={`mov-${animacion.clave}-${indice}`}
            tipo={movimiento.tipo}
            blanco={movimiento.blanco}
            desde={movimiento.desde}
            hasta={movimiento.hasta}
            altura={indice === 1 ? 1.9 : movimiento.tipo === 'n' ? 1.15 : animacion.capturada ? 0.85 : movimiento.tipo === 'k' && animacion.movimientos.length > 1 ? 0.25 : 0.42}
            duracion={animacion.capturada ? DURACION_ATAQUE : indice === 1 ? DURACION_MOVIMIENTO * 1.2 : DURACION_MOVIMIENTO}
            retardo={indice === 1 ? 0.08 : 0}
            onFin={alTerminarPieza}
          />
        ))}

        {animacion?.capturada && (
          <PiezaAnimada
            key={`captura-${animacion.clave}`}
            modo="captura"
            tipo={animacion.capturada.tipo}
            blanco={animacion.capturada.blanco}
            desde={animacion.capturada.casilla}
            hasta={animacion.capturada.destino}
            empuje={animacion.capturada.empuje}
            altura={2.4}
            retardo={DURACION_ATAQUE * animacion.capturada.contacto}
            duracion={DURACION_VUELO_CAPTURA}
            onGolpe={alGolpear}
            onFin={alTerminarPieza}
          />
        )}

        {derribo && <ReyCaido pieza={derribo.pieza} direccion={derribo.direccion} />}

        <Bandejas capturas={capturas} ocultarUltima={Boolean(animacion?.capturada)} />
        <Precalentar />
      </Suspense>

      {!enMenu && (
        <Resaltados
          seleccion={seleccion}
          destinos={destinos.map((m) => m.hasta)}
          capturas={ocupadas}
          jaque={animacion ? null : reyEnJaque}
          hover={hoverValido}
          estilo={ajustes.tablero}
        />
      )}
      <Impactos lista={impactos} onFin={quitarImpacto} />
      <ControlHolograma />
      <Fuegos activo={festejo} />

      <OrbitControls
        ref={controlesRef}
        target={OBJETIVO_ORBITA}
        enablePan={false}
        enableDamping
        dampingFactor={0.075}
        rotateSpeed={0.6}
        enableZoom={false}
        minDistance={8}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2.15}
      />
      <ZoomSuave controlesRef={controlesRef} />

      <DirectorCamara
        modo={enMenu ? 'menu' : 'juego'}
        panelVisible={panelAbierto}
        perspectiva={perspectiva}
        lado={lado}
        cinematica={cinematica}
        controlesRef={controlesRef}
        enfoque={enfoque}
        onCinematica={(activa) => {
          setCinematicaActiva(activa);
          if (!activa) despachar(fijarCinematica(null));
        }}
      />

      <Efectos enfoque={enfoque} calidad={calidad} />
    </>
  );
}

export default function EscenaAjedrez({ modo, panelAbierto = false }) {
  const enfoque = useRef({ objetivo: new THREE.Vector3(0, 0, 0), intensidad: 0 });
  const despachar = useDispatch();

  return (
    <Canvas
      shadows
      flat
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: true }}
      camera={{ position: [14, 7, 14], fov: 34, near: 0.5, far: 320 }}
      onPointerMissed={() => despachar(deseleccionar())}
      onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
    >
      <ProveedorReloj>
        <Escena modo={modo} enfoque={enfoque} panelAbierto={panelAbierto} />
      </ProveedorReloj>
    </Canvas>
  );
}

