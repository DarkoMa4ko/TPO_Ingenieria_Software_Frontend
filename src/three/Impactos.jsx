import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useReloj } from './Reloj.jsx';

// Onda digital: una banda de malla fina que se expande desde el impacto, se curva
// con la ondulación y se disuelve detrás, como si la onda mostrara por un
// instante la trama digital del tablero. Sin aro de borde.

const DURACION = 1.5;

const vertexAnillo = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vMundo;
  void main() {
    vUv = uv - 0.5;
    vMundo = (modelMatrix * vec4(position, 1.0)).xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentAnillo = /* glsl */ `
  uniform float uT;
  uniform float uFuerza;
  uniform float uEscala;
  uniform vec2 uCentro;
  uniform vec3 uFrente;
  uniform vec3 uMedio;
  uniform vec3 uCola;
  uniform float uLimitar;
  varying vec2 vUv;
  varying vec2 vMundo;

  // Línea fina con antialias de un píxel.
  float trazo(float d, float ancho) {
    float aa = fwidth(d);
    return 1.0 - smoothstep(ancho * aa, (ancho + 1.0) * aa, abs(d));
  }

  void main() {
    // Distancias en unidades de mundo para que la malla tenga escala física.
    vec2 rel = vMundo - uCentro;
    float r = length(rel);
    vec2 dir = rel / max(r, 1e-4);

    float avance = 1.0 - pow(2.0, -7.0 * uT);
    float frente = avance * uEscala * 0.92;
    float detras = frente - r;

    // Sin línea de borde: la onda ES la malla. Una banda angosta que aparece con
    // un frente suave (sin aro duro) y se disuelve detrás.
    float delante = smoothstep(0.0, -0.12, -detras);
    float envolvente = exp(-pow(max(detras, 0.0) / 0.38, 2.0)) * delante;

    // Ondulación: la trama se desplaza radialmente con una onda que viaja con la cresta.
    float onda = sin(detras * 22.0) * 0.045 * envolvente;
    vec2 p = vMundo - dir * onda;
    vec2 celda = abs(fract(p / 0.125 + 0.5) - 0.5) * 0.125;
    float malla = max(trazo(celda.x, 0.15), trazo(celda.y, 0.15));
    // Los cruces de la trama brillan un poco más, como nodos de una red.
    float nodo = trazo(length(celda), 0.9) * 0.6;
    float a = (malla + nodo) * envolvente;

    // Rojos de la onda de la mesa: rojo claro en el frente, rojo vivo al medio y
    // carmesí mientras se apaga detrás, con un leve corrimiento que gira alrededor.
    float ang = atan(rel.y, rel.x);
    float k = clamp(smoothstep(0.0, 0.42, max(detras, 0.0)) + 0.12 * sin(ang * 2.0 + uT * 7.0), 0.0, 1.0);
    vec3 degradado = k < 0.5 ? mix(uFrente, uMedio, k * 2.0) : mix(uMedio, uCola, k * 2.0 - 1.0);

    float vida = smoothstep(0.0, 0.05, uT) * (1.0 - smoothstep(0.45, 1.0, uT));
    float tablero = mix(1.0, step(max(abs(vMundo.x), abs(vMundo.y)), 4.82), uLimitar);
    gl_FragColor = vec4(degradado, a * vida * uFuerza * tablero);
  }
`;

const GEOMETRIA = new THREE.PlaneGeometry(1, 1);
GEOMETRIA.rotateX(-Math.PI / 2);
// Los rojos de la onda de la mesa, bajo el umbral del bloom. Verde y azul
// levemente negativos compensan el corrimiento al rosado del tone mapping (AgX).
const FRENTE = new THREE.Color().setRGB(0.92, -0.03, -0.035);
const MEDIO = new THREE.Color().setRGB(0.92, -0.11, -0.08);
const COLA = new THREE.Color().setRGB(0.4, -0.05, -0.035);

function Impacto({ posicion, fuerza, onFin }) {
  const reloj = useReloj();
  const inicio = useRef(null);
  const radio = 1.1 + fuerza * 1.9;

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertexAnillo,
    fragmentShader: fragmentAnillo,
    uniforms: {
      uT: { value: 0 },
      // Translúcida: deja ver el tablero a través de la trama.
      uFuerza: { value: 0.62 },
      uEscala: { value: radio },
      uCentro: { value: new THREE.Vector2(posicion[0], posicion[2]) },
      uFrente: { value: FRENTE },
      uMedio: { value: MEDIO },
      uCola: { value: COLA },
      uLimitar: { value: posicion[1] > -0.1 ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [fuerza, posicion, radio]);

  useFrame(() => {
    if (inicio.current == null) inicio.current = reloj.current.t;
    const t = (reloj.current.t - inicio.current) / DURACION;
    if (t >= 1) {
      onFin();
      return;
    }
    material.uniforms.uT.value = t;
  });

  return (
    // Sobre el marco del tablero (2 cm más alto que las casillas) para que no lo tape.
    <mesh
      geometry={GEOMETRIA}
      material={material}
      position={[posicion[0], posicion[1] + 0.032, posicion[2]]}
      scale={radio * 2}
      renderOrder={3}
      raycast={() => null}
    />
  );
}

export default function Impactos({ lista, onFin }) {
  return lista.map((impacto) => (
    <Impacto key={impacto.id} posicion={impacto.posicion} fuerza={impacto.fuerza} onFin={() => onFin(impacto.id)} />
  ));
}
