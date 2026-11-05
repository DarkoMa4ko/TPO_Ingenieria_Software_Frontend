import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { MASCARA_REFLEJO } from './Lago.jsx';

// Cielo nocturno: nebulosa y vía láctea procedurales, estrellas con color según
// su temperatura, centelleo, destellos en cruz en las más brillantes y alguna
// estrella fugaz de vez en cuando.

const RADIO_CIELO = 210;
const RADIO_ESTRELLAS = 190;
// Normal del plano de la vía láctea (inclinada respecto del horizonte).
const BANDA = new THREE.Vector3(0.35, 0.62, -0.7).normalize();

const ruidoGLSL = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float ruido(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 6; i++) {
      v += a * ruido(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }
`;

const vertexCielo = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentCielo = /* glsl */ `
  uniform vec3 uBanda;
  varying vec3 vDir;
  ${ruidoGLSL}
  void main() {
    vec3 d = normalize(vDir);
    // Fondo: azul noche muy profundo, apenas más claro cerca del horizonte.
    vec3 color = mix(vec3(0.004, 0.006, 0.016), vec3(0.012, 0.014, 0.032), pow(1.0 - abs(d.y), 3.0));

    // Vía láctea: franja difusa con polvo oscuro que la recorta.
    float enBanda = exp(-pow(dot(d, uBanda) / 0.2, 2.0));
    float nubes = fbm(d * 3.2);
    float polvo = smoothstep(0.45, 0.75, fbm(d * 7.0 + 4.0));
    float lactea = enBanda * smoothstep(0.25, 0.8, nubes) * (1.0 - 0.75 * polvo);
    color += vec3(0.11, 0.1, 0.14) * lactea;

    // Nebulosas: velos de color violeta, magenta y verde azulado.
    float n1 = smoothstep(0.5, 0.85, fbm(d * 2.1 + 11.0));
    float n2 = smoothstep(0.55, 0.9, fbm(d * 2.6 - 7.0));
    float n3 = smoothstep(0.6, 0.92, fbm(d * 1.7 + 23.0));
    float cerca = 0.35 + 0.65 * enBanda;
    color += vec3(0.16, 0.06, 0.26) * n1 * cerca;
    color += vec3(0.24, 0.05, 0.16) * n2 * n2 * cerca;
    color += vec3(0.03, 0.15, 0.18) * n3 * cerca;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const vertexEstrellas = /* glsl */ `
  attribute float aTam;
  attribute float aFase;
  attribute float aVelocidad;
  attribute vec3 aColor;
  uniform float uTiempo;
  uniform float uPixel;
  varying vec3 vColor;
  varying float vTam;
  void main() {
    float centelleo = 0.62 + 0.38 * sin(uTiempo * aVelocidad + aFase) * sin(uTiempo * aVelocidad * 0.37 + aFase * 2.1);
    vColor = aColor * centelleo;
    vTam = aTam;
    gl_PointSize = aTam * uPixel;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentEstrellas = /* glsl */ `
  varying vec3 vColor;
  varying float vTam;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    float nucleo = exp(-r * r * 18.0);
    float halo = exp(-r * 5.0) * 0.35;
    // Destellos en cruz sólo en las estrellas grandes.
    float cruz = vTam > 4.0
      ? (exp(-abs(c.x) * 60.0) + exp(-abs(c.y) * 60.0)) * exp(-r * 2.2) * 0.6
      : 0.0;
    float a = (nucleo + halo + cruz) * step(r, 1.0);
    gl_FragColor = vec4(vColor * a, a);
  }
`;

function colorEstelar(t) {
  // t: 0 = azul caliente, 1 = anaranjada fría.
  const azul = new THREE.Color('#a9c4ff');
  const blanca = new THREE.Color('#fff8ef');
  const ambar = new THREE.Color('#ffd2a1');
  return t < 0.5 ? azul.lerp(blanca, t * 2) : blanca.lerp(ambar, (t - 0.5) * 2);
}

function crearEstrellas(cantidad) {
  const posiciones = new Float32Array(cantidad * 3);
  const tamanos = new Float32Array(cantidad);
  const fases = new Float32Array(cantidad);
  const velocidades = new Float32Array(cantidad);
  const colores = new Float32Array(cantidad * 3);
  const v = new THREE.Vector3();
  const eje1 = new THREE.Vector3(1, 0, 0).cross(BANDA).normalize();
  const eje2 = new THREE.Vector3().crossVectors(BANDA, eje1);
  for (let i = 0; i < cantidad; i += 1) {
    if (i % 5 < 2) {
      // 40 % concentradas sobre la vía láctea.
      const ang = Math.random() * Math.PI * 2;
      const desvio = (Math.random() + Math.random() + Math.random() - 1.5) * 0.22;
      v.copy(eje1).multiplyScalar(Math.cos(ang)).addScaledVector(eje2, Math.sin(ang)).addScaledVector(BANDA, desvio).normalize();
    } else {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    }
    posiciones.set([v.x * RADIO_ESTRELLAS, v.y * RADIO_ESTRELLAS, v.z * RADIO_ESTRELLAS], i * 3);
    // Ley de potencias: muchas tenues, pocas muy brillantes.
    const brillo = Math.pow(Math.random(), 7);
    tamanos[i] = 1.1 + brillo * 6.5;
    fases[i] = Math.random() * Math.PI * 2;
    velocidades[i] = 0.6 + Math.random() * 2.6;
    const color = colorEstelar(Math.random()).multiplyScalar(0.55 + brillo * 3.2);
    colores.set([color.r, color.g, color.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geo.setAttribute('aTam', new THREE.BufferAttribute(tamanos, 1));
  geo.setAttribute('aFase', new THREE.BufferAttribute(fases, 1));
  geo.setAttribute('aVelocidad', new THREE.BufferAttribute(velocidades, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colores, 3));
  return geo;
}

// Luna llena: la fuente de luz frontal de la escena. Su disco también está en el
// entorno (ver Iluminacion en EscenaAjedrez), así el vidrio y el mármol reflejan
// una luna. Va fuera del grupo que gira, para no separarse de ese reflejo.
export const DIRECCION_LUNA = new THREE.Vector3(-0.35, 0.33, 0.88).normalize();
const DISTANCIA_LUNA = 180;
const RADIO_LUNA = 4.2;
// El plano lleva la luna y su halo: la luna ocupa un cuarto del semiancho.
const TAM_PLANO_LUNA = RADIO_LUNA * 8;

const vertexLuna = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentLuna = /* glsl */ `
  varying vec2 vUv;
  ${ruidoGLSL}
  void main() {
    vec2 p = (vUv * 2.0 - 1.0) / 0.25;
    float r = length(p);
    float aa = fwidth(r) * 1.5;
    vec3 color = vec3(0.0);
    if (r < 1.0 + aa) {
      // Superficie esférica: mares oscuros, cráteres y un leve oscurecimiento del borde.
      vec3 n = vec3(p, sqrt(max(1.0 - r * r, 0.0)));
      float mares = smoothstep(0.48, 0.68, fbm(n * 2.3 + vec3(3.1, 7.4, 1.2)));
      float crateres = fbm(n * 9.0 + 5.0);
      float albedo = 1.0 - 0.45 * mares - 0.16 * smoothstep(0.45, 0.8, crateres);
      float borde = mix(0.8, 1.0, pow(n.z, 0.35));
      float cubre = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
      color = vec3(1.0, 0.97, 0.9) * albedo * borde * 0.95 * cubre;
    }
    // Halo frío: un anillo de luz pegado al disco y un velo amplio y muy tenue.
    float afuera = max(r - 1.0, 0.0);
    color += vec3(0.72, 0.8, 1.0) * (exp(-afuera * 7.0) * 0.28 + exp(-afuera * 1.3) * 0.1) * step(1.0, r);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Textura de luna para el disco de luz del entorno: mares oscuros sobre un disco claro.
export function texturaLuna() {
  const tam = 256;
  const lienzo = document.createElement('canvas');
  lienzo.width = tam;
  lienzo.height = tam;
  const ctx = lienzo.getContext('2d');
  const imagen = ctx.createImageData(tam, tam);
  const azar = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const suave = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = azar(ix, iy) + (azar(ix + 1, iy) - azar(ix, iy)) * ux;
    const b = azar(ix, iy + 1) + (azar(ix + 1, iy + 1) - azar(ix, iy + 1)) * ux;
    return a + (b - a) * uy;
  };
  for (let y = 0; y < tam; y += 1) {
    for (let x = 0; x < tam; x += 1) {
      const u = (x / tam) * 2 - 1;
      const v = (y / tam) * 2 - 1;
      let ruido = 0;
      let amp = 0.5;
      let f = 3;
      for (let o = 0; o < 5; o += 1) {
        ruido += suave(u * f + 7, v * f + 3) * amp;
        amp *= 0.5;
        f *= 2;
      }
      const mares = Math.min(1, Math.max(0, (ruido - 0.48) / 0.2));
      const valor = 255 * (1 - 0.38 * mares);
      const i = (y * tam + x) * 4;
      imagen.data[i] = valor;
      imagen.data[i + 1] = valor * 0.98;
      imagen.data[i + 2] = valor * 0.94;
      imagen.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imagen, 0, 0);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

function Luna() {
  const malla = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(TAM_PLANO_LUNA, TAM_PLANO_LUNA),
      new THREE.ShaderMaterial({
        vertexShader: vertexLuna,
        fragmentShader: fragmentLuna,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    );
    m.position.copy(DIRECCION_LUNA).multiplyScalar(DISTANCIA_LUNA);
    m.lookAt(0, 0, 0);
    m.renderOrder = -8.5;
    m.frustumCulled = false;
    m.raycast = () => null;
    m.layers.mask = MASCARA_REFLEJO;
    return m;
  }, []);
  return <primitive object={malla} />;
}

// Estrella fugaz: una cabeza brillante con estela que se desvanece. Los puntos
// van a menos de un píxel uno de otro: con pocos, la estela se veía punteada (y
// en el reflejo del lago, como rayas sueltas que titilaban).
const PUNTOS_ESTELA = 180;
// Cada punto se pisa con los vecinos: se baja su brillo para que la suma quede igual.
const DENSIDAD_ESTELA = 0.3;
function Fugaces() {
  const ref = useRef(null);
  const estado = useRef({ proxima: 3 + Math.random() * 4, inicio: -10, origen: new THREE.Vector3(), dir: new THREE.Vector3() });
  const { geometria, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PUNTOS_ESTELA * 3), 3));
    geo.setAttribute('aBrillo', new THREE.BufferAttribute(new Float32Array(PUNTOS_ESTELA), 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aBrillo;
        uniform float uPixel;
        varying float vBrillo;
        void main() {
          vBrillo = aBrillo;
          gl_PointSize = (1.0 + aBrillo * 3.0) * uPixel;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uDensidad;
        varying float vBrillo;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-r * r * 6.0) * vBrillo * uDensidad;
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * 3.0 * a, a);
        }
      `,
      uniforms: { uPixel: { value: 1 }, uDensidad: { value: DENSIDAD_ESTELA } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geometria: geo, material: mat };
  }, []);

  useFrame(({ clock, gl }) => {
    const s = estado.current;
    const t = clock.elapsedTime;
    material.uniforms.uPixel.value = gl.getPixelRatio();
    if (t > s.proxima) {
      s.inicio = t;
      s.proxima = t + 5 + Math.random() * 8;
      // Arranca en el cielo alto y cae en diagonal.
      const az = Math.random() * Math.PI * 2;
      const el = 0.35 + Math.random() * 0.5;
      s.origen.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(RADIO_ESTRELLAS - 5);
      const tangente = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
      s.dir.copy(tangente).addScaledVector(new THREE.Vector3(0, -1, 0), 0.45).normalize();
    }
    const k = (t - s.inicio) / 0.9;
    const pos = geometria.attributes.position;
    const brillo = geometria.attributes.aBrillo;
    const visible = k >= 0 && k <= 1;
    if (ref.current) ref.current.visible = visible;
    if (!visible) return;
    const desvanecer = Math.sin(Math.PI * k);
    for (let i = 0; i < PUNTOS_ESTELA; i += 1) {
      const atras = i / (PUNTOS_ESTELA - 1);
      const avance = k * 70 - atras * 22;
      pos.setXYZ(i, s.origen.x + s.dir.x * avance, s.origen.y + s.dir.y * avance, s.origen.z + s.dir.z * avance);
      brillo.setX(i, Math.pow(1 - atras, 2.2) * desvanecer);
    }
    pos.needsUpdate = true;
    brillo.needsUpdate = true;
  });

  // Sólo en el cielo, no en el reflejo del lago: el agua ondula el reflejo y una
  // estela tan fina se veía como una línea torcida, como un error de dibujo.
  return <points ref={ref} geometry={geometria} material={material} frustumCulled={false} renderOrder={-9} visible={false} />;
}

export default function CieloMagico({ calidad = 'alta' }) {
  const grupo = useRef(null);
  const { gl } = useThree();
  const cantidad = calidad === 'alta' ? 14000 : 7000;

  const domo = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertexCielo,
    fragmentShader: fragmentCielo,
    uniforms: { uBanda: { value: BANDA } },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }), []);

  const estrellas = useMemo(() => crearEstrellas(cantidad), [cantidad]);
  const materialEstrellas = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertexEstrellas,
    fragmentShader: fragmentEstrellas,
    uniforms: { uTiempo: { value: 0 }, uPixel: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);

  useFrame(({ clock }, delta) => {
    materialEstrellas.uniforms.uTiempo.value = clock.elapsedTime;
    materialEstrellas.uniforms.uPixel.value = gl.getPixelRatio();
    // La bóveda gira muy despacio, como en una toma de larga exposición.
    if (grupo.current) grupo.current.rotation.y += delta * 0.004;
  });

  return (
    <>
    <Luna />
    <group ref={grupo}>
      {/* Todo el cielo se ve también en el lago (capa del reflejo). */}
      <mesh material={domo} renderOrder={-10} frustumCulled={false} raycast={() => null} layers-mask={MASCARA_REFLEJO}>
        <sphereGeometry args={[RADIO_CIELO, 64, 32]} />
      </mesh>
      <points geometry={estrellas} material={materialEstrellas} renderOrder={-9} frustumCulled={false} raycast={() => null} layers-mask={MASCARA_REFLEJO} />
      <Fugaces />
    </group>
    </>
  );
}
