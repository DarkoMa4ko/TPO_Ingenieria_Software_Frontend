import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ESTADO_LAGO, MASCARA_REFLEJO } from './Lago.jsx';

// Fuegos artificiales en el cielo nocturno. Toda la física corre en el shader:
// cada chispa sale con una velocidad, la frena el aire y la tira la gravedad,
// y se dibuja con una estela corta (varias muestras atrasadas en el tiempo).

const RANURAS = 8;
const CHISPAS = 300;
const MUESTRAS = 6;
const PUNTOS_COHETE = 14;
const SUBIDA = 0.85;

// Paleta en la línea de la onda de color: violeta, rosa, ámbar y oro blanco.
const PARES = [
  ['#9b6bff', '#ff5fb0'],
  ['#ff5fb0', '#ffc24a'],
  ['#ffd27a', '#fff3d6'],
  ['#b58cff', '#ffc24a'],
  ['#ff7ab8', '#fff3d6'],
];
// Festejo de fin de partida: el primer cohete sale enseguida y después uno cada
// 0,45 a 1,35 s (a veces dos juntos), hasta que empieza otra partida.
const PRIMER_DISPARO = 0.6;
const INTERVALO = [0.45, 1.35];
// Zonas de la pantalla (coordenadas normalizadas) donde se ve cielo en la vista de
// juego: arriba del borde lejano de la mesa, sin quedar debajo del marcador ni del panel.
const ZONAS = [
  { x: [-0.95, -0.5], y: [0.66, 0.9] },
  { x: [-0.5, -0.3], y: [0.62, 0.74] },
  { x: [0.42, 0.85], y: [0.84, 0.97] },
];

const vertexFuego = /* glsl */ `
  attribute vec3 aDir;
  attribute float aRapidez;
  attribute float aMuestra;
  attribute float aAzar;
  attribute float aTipo;
  uniform float uTiempo;
  uniform float uInicio;
  uniform vec3 uOrigen;
  uniform vec3 uLanzamiento;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uPixel;
  uniform float uEscala;
  varying vec3 vColor;
  varying float vAlfa;
  varying float vSuave;

  const float VIDA = 2.5;
  const float K = 1.45;
  const vec3 G = vec3(0.0, -3.4, 0.0);

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    float t = uTiempo - uInicio;
    vec3 p = uOrigen;
    vec3 color = vec3(0.0);
    float alfa = 0.0;
    float tam = 2.0;
    vSuave = 0.0;

    if (aTipo < 0.5) {
      // Chispa de la explosión: velocidad inicial, arrastre del aire y gravedad.
      float te = t - ${SUBIDA.toFixed(2)} - aMuestra * 0.032;
      if (te > 0.0 && te < VIDA) {
        float e = (1.0 - exp(-K * te)) / K;
        vec3 v0 = aDir * aRapidez * uEscala;
        p = uOrigen + v0 * e + G * uEscala * (te / K - e / K);
        float k = te / VIDA;
        float brasa = smoothstep(0.5, 1.0, k);
        vec3 base = mix(uColorA, uColorB, step(0.5, aAzar));
        vec3 caliente = mix(vec3(1.6, 1.5, 1.35), base * 2.4, smoothstep(0.0, 0.12, k));
        color = mix(caliente, vec3(1.3, 0.48, 0.14), brasa * 0.75);
        // Algunas chispas crepitan al final, como las de verdad.
        float crepita = aAzar > 0.55 ? step(0.45, hash(floor(uTiempo * 22.0) + aAzar * 311.0)) : 1.0;
        alfa = pow(1.0 - k, 1.4) * mix(1.0, crepita, brasa) * (1.0 - aMuestra / ${MUESTRAS.toFixed(1)});
        tam = mix(3.4, 1.6, k) * (1.0 - aMuestra * 0.09);
      }
    } else if (aTipo < 1.5) {
      // Cohete: sube frenando, con una estela dorada que se apaga.
      float tr = t - aMuestra * 0.03;
      if (t > 0.0 && tr > 0.0 && t < ${SUBIDA.toFixed(2)}) {
        float s = 1.0 - pow(1.0 - tr / ${SUBIDA.toFixed(2)}, 2.0);
        p = mix(uLanzamiento, uOrigen, s);
        p.x += sin(tr * 26.0 + aAzar * 6.28) * 0.06 * uEscala;
        color = vec3(1.6, 1.05, 0.55);
        alfa = (1.0 - aMuestra / ${PUNTOS_COHETE.toFixed(1)}) * 0.9;
        tam = 2.4 - aMuestra * 0.11;
      }
    } else {
      // Destello del estallido: un brillo amplio y breve.
      float te = t - ${SUBIDA.toFixed(2)};
      if (te > 0.0 && te < 0.4) {
        color = mix(vec3(1.7), uColorA * 2.2, 0.35);
        alfa = pow(1.0 - te / 0.4, 2.0) * 0.9;
        tam = 70.0 * (0.45 + te);
        vSuave = 1.0;
      }
    }

    vColor = color;
    vAlfa = alfa;
    gl_PointSize = alfa > 0.0 ? tam * uPixel : 0.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentFuego = /* glsl */ `
  varying vec3 vColor;
  varying float vAlfa;
  varying float vSuave;
  void main() {
    if (vAlfa <= 0.0) discard;
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float chispa = pow(max(0.0, 1.0 - d), 2.2);
    float destello = exp(-d * d * 4.0) * (1.0 - d);
    float a = mix(chispa, destello, vSuave) * vAlfa;
    gl_FragColor = vec4(vColor, a);
  }
`;

function crearGeometria() {
  const total = CHISPAS * MUESTRAS + PUNTOS_COHETE + 1;
  const dir = new Float32Array(total * 3);
  const rapidez = new Float32Array(total);
  const muestra = new Float32Array(total);
  const azar = new Float32Array(total);
  const tipo = new Float32Array(total);
  const v = new THREE.Vector3();
  let i = 0;
  for (let c = 0; c < CHISPAS; c += 1) {
    // Esfera casi uniforme, con algo de irregularidad como un estallido real.
    v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    while (v.lengthSq() > 1 || v.lengthSq() < 0.01) v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    v.normalize();
    const vel = 12 + Math.random() * 4;
    const semilla = Math.random();
    for (let m = 0; m < MUESTRAS; m += 1) {
      dir.set([v.x, v.y, v.z], i * 3);
      rapidez[i] = vel;
      muestra[i] = m;
      azar[i] = semilla;
      tipo[i] = 0;
      i += 1;
    }
  }
  const semillaCohete = Math.random();
  for (let m = 0; m < PUNTOS_COHETE; m += 1) {
    muestra[i] = m;
    azar[i] = semillaCohete;
    tipo[i] = 1;
    i += 1;
  }
  tipo[i] = 2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aRapidez', new THREE.BufferAttribute(rapidez, 1));
  geo.setAttribute('aMuestra', new THREE.BufferAttribute(muestra, 1));
  geo.setAttribute('aAzar', new THREE.BufferAttribute(azar, 1));
  geo.setAttribute('aTipo', new THREE.BufferAttribute(tipo, 1));
  return geo;
}

const adelante = new THREE.Vector3();

function Fuegos({ activo = true }) {
  const { camera, gl } = useThree();
  const geometria = useMemo(crearGeometria, []);
  // Una ranura por cohete, con su propio material (mismo programa compilado).
  const ranuras = useMemo(() => Array.from({ length: RANURAS }, () => new THREE.ShaderMaterial({
    vertexShader: vertexFuego,
    fragmentShader: fragmentFuego,
    uniforms: {
      uTiempo: { value: 0 },
      uInicio: { value: -100 },
      uOrigen: { value: new THREE.Vector3() },
      uLanzamiento: { value: new THREE.Vector3() },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uPixel: { value: 1 },
      uEscala: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })), []);
  const proximo = useRef(null);
  const siguiente = useRef(0);

  useEffect(() => () => ranuras.forEach((m) => m.dispose()), [ranuras]);

  function disparar(ahora) {
    const material = ranuras[siguiente.current % RANURAS];
    siguiente.current += 1;
    // Se ubica en una zona de cielo visible de la pantalla, lejos detrás de la mesa.
    const zona = ZONAS[Math.floor(Math.random() * ZONAS.length)];
    const nx = zona.x[0] + Math.random() * (zona.x[1] - zona.x[0]);
    const ny = zona.y[0] + Math.random() * (zona.y[1] - zona.y[0]);
    adelante.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    const distancia = 75 + Math.random() * 25;
    const u = material.uniforms;
    u.uOrigen.value.copy(camera.position).addScaledVector(adelante, distancia);
    // En la vista de juego esas zonas miran por debajo del horizonte, hacia el lago:
    // el fuego va en la imagen especular, arriba del agua, y se lo ve reflejado
    // justo en el lugar elegido de la pantalla.
    const nivel = ESTADO_LAGO.nivel;
    if (u.uOrigen.value.y < nivel + 4) u.uOrigen.value.y = 2 * nivel - u.uOrigen.value.y;
    u.uLanzamiento.value.copy(u.uOrigen.value).add(new THREE.Vector3((Math.random() - 0.5) * 5, -20, 0));
    u.uLanzamiento.value.y = Math.max(u.uLanzamiento.value.y, nivel + 0.5);
    u.uEscala.value = distancia / 60;
    const [a, b] = PARES[Math.floor(Math.random() * PARES.length)];
    u.uColorA.value.set(a);
    u.uColorB.value.set(b);
    u.uInicio.value = ahora;
  }

  useFrame(({ clock }) => {
    const ahora = clock.elapsedTime;
    if (!activo) {
      proximo.current = null;
    } else if (proximo.current == null) {
      proximo.current = ahora + PRIMER_DISPARO;
    } else if (ahora >= proximo.current) {
      disparar(ahora);
      if (Math.random() < 0.25) disparar(ahora);
      proximo.current = ahora + INTERVALO[0] + Math.random() * (INTERVALO[1] - INTERVALO[0]);
    }
    const pixel = gl.getPixelRatio();
    for (const material of ranuras) {
      material.uniforms.uTiempo.value = ahora;
      material.uniforms.uPixel.value = pixel;
    }
  });

  return ranuras.map((material, i) => (
    // eslint-disable-next-line react/no-array-index-key
    <points key={i} geometry={geometria} material={material} frustumCulled={false} renderOrder={-8} raycast={() => null} layers-mask={MASCARA_REFLEJO} />
  ));
}

export default memo(Fuegos);
