import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { casillaOffset } from '../utils/fen.js';
import { PiezaModelo, giroDe } from './Piezas.jsx';
import { useReloj } from './Reloj.jsx';
import { MATERIAL_LATON, useRecursosPiezas } from './materiales.js';
import { PLANO_NEUTRO, crearMaterialHolo } from './holograma.js';

const ASENTAMIENTO = 0.32;
// La capturada se queda un poco más en la bandeja para rematerializarse.
const REMATERIALIZAR = 0.6;
const DESMATERIALIZAR = 0.4;
const ALTO_PIEZA = 1.8;

export function suave(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function aCoordenadas(valor, y = 0.002) {
  if (Array.isArray(valor)) return valor;
  const { x, z } = casillaOffset(valor);
  return [x, y, z];
}

const eje = new THREE.Vector3();
const cuaternion = new THREE.Quaternion();
const inclinacion = new THREE.Quaternion();
const arriba = new THREE.Vector3();
const punto = new THREE.Vector3();
const opuesto = new THREE.Vector3();
const suaveSalida = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * modo "movimiento": despegue, arco, inclinación según la velocidad y un
 *   asentamiento amortiguado al aterrizar.
 * modo "captura": la pieza capturada es golpeada, da vueltas en el aire y
 *   termina parada en la bandeja.
 */
export default function PiezaAnimada({
  tipo,
  blanco,
  desde,
  hasta,
  modo = 'movimiento',
  altura = 0.5,
  duracion = 0.6,
  retardo = 0,
  empuje = [0, 0],
  onImpacto,
  onGolpe,
  onFin,
}) {
  const ref = useRef(null);
  const reloj = useReloj();
  const { materiales } = useRecursosPiezas();

  // Materiales propios de la pieza capturada: el sólido y las aristas se reparten
  // la pieza con un plano que la recorre a lo largo de su propio eje.
  const holo = useMemo(() => {
    if (modo !== 'captura') return null;
    const planoSolido = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
    const planoHolo = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1e5);
    const cuerpo = materiales[`${tipo}${blanco ? 'b' : 'n'}`].clone();
    cuerpo.clippingPlanes = [planoSolido];
    cuerpo.clipShadows = true;
    const cruz = MATERIAL_LATON.clone();
    cruz.clippingPlanes = [planoSolido];
    cruz.clipShadows = true;
    const lineas = crearMaterialHolo({ planos: [planoHolo, PLANO_NEUTRO], color: '#7cf1ff', intensidad: 3.2 });
    lineas.uniforms.uGlitch.value = 1.6;
    return { planoSolido, planoHolo, materiales: { cuerpo, cruz, holo: lineas } };
  }, [modo, tipo, blanco, materiales]);

  useEffect(() => () => {
    if (!holo) return;
    Object.values(holo.materiales).forEach((m) => m.dispose());
  }, [holo]);
  const inicio = useRef(null);
  const estado = useRef({ impacto: false, golpe: false, fin: false });
  const origen = aCoordenadas(desde);
  const destino = aCoordenadas(hasta);
  const dx = destino[0] - origen[0];
  const dz = destino[2] - origen[2];
  const distancia = Math.hypot(dx, dz) || 1;
  const semillaDesde = typeof desde === 'string' ? desde : '';
  const semillaHasta = typeof hasta === 'string' ? hasta : semillaDesde;
  const giroInicial = giroDe(tipo, blanco, semillaDesde);
  let giroFinal = giroDe(tipo, blanco, semillaHasta);
  if (giroFinal - giroInicial > Math.PI) giroFinal -= Math.PI * 2;
  if (giroInicial - giroFinal > Math.PI) giroFinal += Math.PI * 2;

  function cortarHolograma(grupo, altura) {
    arriba.set(0, 1, 0).applyQuaternion(grupo.quaternion);
    punto.copy(grupo.position).addScaledVector(arriba, altura);
    holo.planoSolido.setFromNormalAndCoplanarPoint(opuesto.copy(arriba).negate(), punto);
    holo.planoHolo.setFromNormalAndCoplanarPoint(arriba, punto);
  }

  useFrame(() => {
    const grupo = ref.current;
    if (!grupo) return;
    if (inicio.current == null) inicio.current = reloj.current.t + retardo;
    const s = estado.current;
    const transcurrido = reloj.current.t - inicio.current;
    const t = Math.max(0, Math.min(1, transcurrido / duracion));
    const despues = Math.max(0, transcurrido - duracion);

    if (modo === 'movimiento') {
      const e = suave(t);
      const arco = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.85) * altura;
      grupo.position.set(origen[0] + dx * e, origen[1] + arco, origen[2] + dz * e);

      // Velocidad horizontal normalizada => inclinación hacia adelante.
      const asentamiento = despues < ASENTAMIENTO
        ? Math.sin((despues / ASENTAMIENTO) * Math.PI * 3) * 0.045 * (1 - despues / ASENTAMIENTO)
        : 0;
      const angulo = t < 1 ? Math.sin(Math.PI * t) * 0.11 : -asentamiento;
      eje.set(dz / distancia, 0, -dx / distancia);
      inclinacion.setFromAxisAngle(eje, angulo);
      cuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (giroFinal - giroInicial) * e);
      grupo.quaternion.copy(inclinacion).multiply(cuaternion);
    } else {
      // Pieza capturada: golpe, trompos y aterrizaje en la bandeja.
      if (transcurrido < 0) {
        grupo.position.set(origen[0], origen[1], origen[2]);
        grupo.quaternion.identity();
        cortarHolograma(grupo, ALTO_PIEZA + 1);
        return;
      }
      if (!s.golpe) {
        s.golpe = true;
        onGolpe?.(origen);
      }
      const e = suave(t);
      // Golpe inmediato: sale despedida en la dirección del ataque antes de
      // que la atacante ocupe la casilla, y luego vuela hacia la bandeja.
      const golpe = 1 - Math.pow(1 - Math.min(1, transcurrido / 0.22), 3);
      const alejamiento = 1.15 * golpe * (1 - e);
      const arco = Math.sin(Math.PI * t) * altura + golpe * 0.25 * (1 - e);
      grupo.position.set(
        origen[0] + dx * e + empuje[0] * alejamiento,
        origen[1] + (destino[1] - origen[1]) * e + arco,
        origen[2] + dz * e + empuje[1] * alejamiento,
      );
      const vueltas = Math.PI * 2 * (1 - Math.pow(1 - t, 2.4));
      eje.set(empuje[1] || dz, 0, -(empuje[0] || dx)).normalize();
      inclinacion.setFromAxisAngle(eje, vueltas);
      cuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (giroFinal - giroInicial) * e + vueltas);
      grupo.quaternion.copy(cuaternion).multiply(inclinacion);
      if (t >= 1 && despues < ASENTAMIENTO) {
        grupo.position.y += Math.abs(Math.sin((despues / ASENTAMIENTO) * Math.PI * 2)) * 0.05 * (1 - despues / ASENTAMIENTO);
      }
      // Se desmaterializa de arriba abajo al recibir el golpe, vuela como
      // holograma y se rematerializa de abajo arriba al llegar a la bandeja.
      let corte = ALTO_PIEZA - (ALTO_PIEZA + 0.05) * suaveSalida(transcurrido / DESMATERIALIZAR);
      if (t >= 1) corte = -0.05 + (ALTO_PIEZA + 0.1) * suaveSalida(despues / REMATERIALIZAR);
      holo.materiales.holo.uniforms.uOpacidad.value = t >= 1 ? 1 - suaveSalida(despues / REMATERIALIZAR) * 0.6 : 1;
      cortarHolograma(grupo, corte);
    }

    if (t >= 1 && !s.impacto) {
      s.impacto = true;
      onImpacto?.(destino);
    }
    if (despues >= (modo === 'captura' ? REMATERIALIZAR + 0.05 : ASENTAMIENTO) && !s.fin) {
      s.fin = true;
      onFin?.();
    }
  }, -1);

  return (
    <group ref={ref} position={origen}>
      <PiezaModelo tipo={tipo} blanco={blanco} semilla={semillaDesde} sombras materiales={holo?.materiales} />
    </group>
  );
}
