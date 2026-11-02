import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PERSPECTIVAS } from '../ui/perspectivas.js';

const FOV_JUEGO = 38;
const OBJETIVO_JUEGO = new THREE.Vector3(0, -0.2, 0);

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutQuint = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function angulo(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// En pantallas muy anchas, con el mismo lente, la perspectiva estira los bordes:
// el cielo y la luna se veían "extendidos", sobre todo del lado del panel, que
// además queda lejos del centro por el encuadre descentrado. Se cierra el lente y
// se aleja la cámara en la misma proporción: el tablero queda igual de grande y
// los bordes dejan de deformarse. Hasta 16:9 no cambia nada.
const ASPECTO_ANCHO = 1.8;
function compensarAncho(fov, aspecto) {
  if (aspecto <= ASPECTO_ANCHO) return { fov, distancia: 1 };
  const k = ASPECTO_ANCHO / aspecto;
  const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * k;
  return { fov: THREE.MathUtils.radToDeg(2 * Math.atan(t)), distancia: 1 / k };
}

function toma(posicion, objetivo, fov) {
  const o = objetivo.clone();
  const esf = new THREE.Spherical().setFromVector3(posicion.clone().sub(o));
  return { objetivo: o, esf, fov };
}

// En pantallas verticales el campo horizontal es estrecho: se aleja la cámara y
// se abre un poco el lente para que el tablero entre completo.
// La vista cenital y las laterales se orientan según el lado elegido: con las
// negras, las negras quedan abajo en pantalla y "izquierda" es la de ellas.
function tomaPerspectiva(clave, aspecto = 1.6, lado = 'blancas') {
  const t = toma(new THREE.Vector3(...PERSPECTIVAS[clave].posicion), OBJETIVO_JUEGO, PERSPECTIVAS[clave].fov ?? FOV_JUEGO);
  if (clave === 'cenital') t.esf.theta = lado === 'negras' ? Math.PI : 0;
  if (PERSPECTIVAS[clave].lateral && lado === 'negras') t.esf.theta += Math.PI;
  if (aspecto < 1.25) {
    const k = Math.min(1, (1.25 - aspecto) / 0.8);
    t.esf.radius *= 1 + k * 0.42;
    t.fov = Math.min(54, t.fov * (1 + k * 0.26));
  }
  const ancho = compensarAncho(t.fov, aspecto);
  t.fov = ancho.fov;
  t.esf.radius *= ancho.distancia;
  return t;
}

const tmp = new THREE.Vector3();

/**
 * Dirige la cámara en todos los modos:
 *  - menu: órbita lenta y continua alrededor del tablero.
 *  - juego: OrbitControls libre; los cambios de perspectiva viajan en arco.
 *  - cinemáticas (captura / mate): plano cerrado con paneo lento y vuelta.
 * Publica el punto de enfoque para la profundidad de campo en `enfoque`.
 */
export default function DirectorCamara({ modo, perspectiva, lado, cinematica, controlesRef, enfoque, onCinematica, panelVisible = true }) {
  const { camera, size } = useThree();
  const desplazamiento = useRef({ x: 0, y: 0 });
  const estado = useRef({ transicion: null, orbita: null, cine: null, ultimaPerspectiva: `${perspectiva}-${lado}`, modo: null });
  const onCinematicaRef = useRef(onCinematica);
  onCinematicaRef.current = onCinematica;

  function actual() {
    const objetivo = controlesRef.current?.target?.clone() ?? OBJETIVO_JUEGO.clone();
    return toma(camera.position, objetivo, camera.fov);
  }

  function viajar(hasta, duracion, ease = easeInOutCubic, alTerminar = null) {
    estado.current.transicion = { desde: actual(), hasta, inicio: null, duracion, ease, alTerminar };
    if (controlesRef.current) controlesRef.current.enabled = false;
  }

  // Cambios de modo: menú <-> juego.
  useEffect(() => {
    const s = estado.current;
    const previo = s.modo;
    s.modo = modo;
    if (modo === 'menu') {
      s.transicion = null;
      s.cine = null;
      const esf = new THREE.Spherical().setFromVector3(tmp.copy(camera.position));
      s.orbita = { theta: esf.theta, mezcla: previo ? 0 : 1 };
      if (controlesRef.current) controlesRef.current.enabled = false;
    } else {
      s.orbita = null;
      viajar(tomaPerspectiva(perspectiva, size.width / size.height, lado), previo === 'menu' ? 2.8 : 1.4, easeInOutQuint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  // Cambio de perspectiva elegido por el usuario.
  useEffect(() => {
    const s = estado.current;
    const clave = `${perspectiva}-${lado}`;
    if (s.ultimaPerspectiva === clave) return;
    s.ultimaPerspectiva = clave;
    if (modo !== 'juego' || s.cine) return;
    viajar(tomaPerspectiva(perspectiva, size.width / size.height, lado), 1.35);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspectiva, lado]);

  // Cinemáticas.
  useEffect(() => {
    const s = estado.current;
    if (!cinematica || modo !== 'juego') return;
    const guardada = s.transicion ? s.transicion.hasta : actual();
    const foco = new THREE.Vector3(...cinematica.foco);
    const desdeFoco = new THREE.Spherical().setFromVector3(camera.position.clone().sub(foco));
    const esMate = cinematica.tipo === 'mate';
    const esf = new THREE.Spherical(
      esMate ? 5.4 : 5.6,
      esMate ? 1.08 : 1.02,
      desdeFoco.theta + (esMate ? 0.65 : 0.42),
    );
    const plano = { objetivo: foco, esf, fov: esMate ? 30 : 33 };
    s.cine = {
      fase: 'entrar',
      plano,
      guardada,
      panoramica: esMate ? 0.6 : 0.38,
      espera: cinematica.espera ?? (esMate ? 3.6 : 1.7),
      inicio: null,
    };
    onCinematicaRef.current?.(true);
    viajar(plano, esMate ? 1.5 : 0.85, easeInOutCubic, () => {
      s.cine.fase = 'mantener';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinematica]);

  // Prioridad -1: la cámara se mueve antes de que el tablero renderice su reflejo
  // (prioridad 0); si no, el reflejo queda un cuadro atrasado y se ve desalineado.
  useFrame(({ clock }, delta) => {
    const s = estado.current;
    const ahora = clock.elapsedTime;
    const controles = controlesRef.current;
    let foco = controles?.target ?? OBJETIVO_JUEGO;
    let desenfoque = 0;

    if (s.orbita) {
      s.orbita.theta += delta * 0.07;
      s.orbita.mezcla = Math.min(1, s.orbita.mezcla + delta * 0.35);
      const ancho = compensarAncho(34, size.width / size.height);
      const radio = 19 * ancho.distancia;
      const altura = (6.6 + Math.sin(ahora * 0.17) * 0.8) * ancho.distancia;
      tmp.set(Math.sin(s.orbita.theta) * radio, altura, Math.cos(s.orbita.theta) * radio);
      camera.position.lerp(tmp, easeOutCubic(s.orbita.mezcla) * 0.06 + (s.orbita.mezcla >= 1 ? 0.94 : 0));
      camera.fov += (ancho.fov - camera.fov) * Math.min(1, delta * 2);
      camera.updateProjectionMatrix();
      camera.lookAt(0, -0.4, 0);
      foco = OBJETIVO_JUEGO;
      desenfoque = 0.32;
    } else if (s.transicion) {
      const tr = s.transicion;
      if (tr.inicio == null) tr.inicio = ahora;
      const k = tr.ease(Math.min(1, (ahora - tr.inicio) / tr.duracion));
      const objetivo = tmp.lerpVectors(tr.desde.objetivo, tr.hasta.objetivo, k).clone();
      const esf = new THREE.Spherical(
        THREE.MathUtils.lerp(tr.desde.esf.radius, tr.hasta.esf.radius, k),
        THREE.MathUtils.lerp(tr.desde.esf.phi, tr.hasta.esf.phi, k),
        angulo(tr.desde.esf.theta, tr.hasta.esf.theta, k),
      );
      camera.position.setFromSpherical(esf).add(objetivo);
      camera.fov = THREE.MathUtils.lerp(tr.desde.fov, tr.hasta.fov, k);
      camera.updateProjectionMatrix();
      camera.lookAt(objetivo);
      if (controles) controles.target.copy(objetivo);
      foco = objetivo;
      desenfoque = !s.cine ? 0 : s.cine.fase === 'salir' ? 1 - k : k;
      if (k >= 1) {
        s.transicion = null;
        if (!s.cine && controles) {
          controles.enabled = true;
          controles.update();
        }
        tr.alTerminar?.();
      }
    } else if (s.cine?.fase === 'mantener') {
      const c = s.cine;
      if (c.inicio == null) c.inicio = ahora;
      const k = Math.min(1, (ahora - c.inicio) / c.espera);
      const esf = c.plano.esf.clone();
      esf.theta += c.panoramica * easeInOutCubic(k);
      esf.radius *= 1 - 0.08 * k;
      camera.position.setFromSpherical(esf).add(c.plano.objetivo);
      camera.lookAt(c.plano.objetivo);
      foco = c.plano.objetivo;
      desenfoque = 1;
      if (k >= 1) {
        c.fase = 'salir';
        c.plano = { ...c.plano, esf };
        viajar(c.guardada, 1.05, easeInOutCubic, () => {
          s.cine = null;
          if (controles) {
            controles.enabled = true;
            controles.update();
          }
          onCinematicaRef.current?.(false);
        });
      }
    }

    // Encuadre: en el menú el tablero queda centrado detrás de la tarjeta; en la
    // partida se corre para que la isla (tablero y bandejas) no quede debajo
    // del panel. El corrimiento descentra la proyección y estira el cielo del lado
    // del panel, así que se usa sólo lo que hace falta (nunca más que el tope de
    // antes): en pantallas anchas la isla ya entra centrada y no se corre nada.
    // Con el panel oculto la imagen queda centrada.
    const ancho = size.width;
    const angosto = ancho < 860;
    const tope = ancho > 1180 ? 0.12 : 0.06;
    // Borde izquierdo del panel (ver .panel en index.css) y borde derecho de la
    // isla con la imagen centrada (en la vista de juego, unos 0,75 del alto).
    const panelIzquierda = ancho - THREE.MathUtils.clamp(ancho * 0.026, 16, 36) - (ancho <= 1180 ? 310 : 340);
    const islaDerecha = ancho / 2 + size.height * 0.75 + 30;
    const corrimientoPanel = Math.min(tope, Math.max(0, islaDerecha - panelIzquierda) / ancho);
    const objetivoX = angosto || s.orbita || !panelVisible ? 0 : corrimientoPanel;
    const objetivoY = angosto && !s.orbita ? 0.02 : 0;
    const d = desplazamiento.current;
    d.x += (objetivoX - d.x) * Math.min(1, delta * 2.2);
    d.y += (objetivoY - d.y) * Math.min(1, delta * 2.2);
    if (Math.abs(d.x) > 0.0005 || Math.abs(d.y) > 0.0005) {
      camera.setViewOffset(ancho, size.height, d.x * ancho, d.y * size.height, ancho, size.height);
    } else if (camera.view) {
      camera.clearViewOffset();
    }

    if (enfoque) {
      enfoque.current.objetivo.lerp(foco, Math.min(1, delta * 8));
      enfoque.current.intensidad += (desenfoque - enfoque.current.intensidad) * Math.min(1, delta * 4);
    }
  }, -1);

  // El reflejo del tablero lee camera.matrixWorld antes del render, cuando three
  // todavía no lo actualizó: sin esto usa la cámara del cuadro anterior.
  useFrame(() => camera.updateMatrixWorld(), -0.5);

  return null;
}
