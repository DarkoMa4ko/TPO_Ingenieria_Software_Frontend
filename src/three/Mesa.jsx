import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  MATERIAL_ACERO,
  MATERIAL_LATON,
  MATERIAL_VIDRIO_NEGRO,
  useParedesMesa,
  useRecursosTablero,
} from './materiales.js';
import { MESA_Y } from './Tablero.jsx';
import { MASCARA_REFLEJO, NIVEL_CASCADA } from './Lago.jsx';
import CascadaFluida, { CAPA_POZO } from './CascadaFluida.jsx';
import PantallaChaflan from './PantallaChaflan.jsx';
import CartelAnuncios, { CHAFLAN_BORDE } from './CartelAnuncios.jsx';
import { DURACION_ONDA, ONDA, dispararOnda } from './onda.js';

export { dispararOnda };

// Mesa con espejo infinito. El tablero y las bandejas apoyan sobre una isla
// central; alrededor, bajo un vidrio semiespejado, se ve el "pozo" infinito.
//
// Un espejo infinito real es un vidrio parcialmente reflectante sobre un espejo
// total, con LEDs entre ambos: cada rebote repite la escena más abajo y con
// menos luz. Acá se dibuja ese túnel como N tramos apilados, cada uno atenuado
// por la reflectividad, y sólo se ve a través del vidrio (máscara de stencil).
// No hay fondo: la luz se extingue rebote a rebote, como en uno real.

// Más grande que el tablero con las bandejas: deja aire entre ellos y el chaflán por los cuatro lados.
const ISLA = [8.5, 6.0];
// Chaflán a 45° en los cuatro cantos de la isla; la cara de adelante lleva el logo.
const CHAFLAN = 0.5;
const ISLA_SUPERIOR = [ISLA[0] - CHAFLAN, ISLA[1] - CHAFLAN];
const POZO = [12.6, 9.6];
const BORDE = 0.42;
// Medidas que usa el lago para reflejar la luz del borde de la mesa.
export const MEDIDAS_MESA = { semiancho: [POZO[0] + BORDE, POZO[1] + BORDE], altoBorde: MESA_Y + 0.04 };
// Con la cascada el agua llega al borde del pozo y la luz sale del hueco.
// El lago llega hasta la arista de arriba del chaflán del cartel y ahí se vuelca.
const HUECO_CASCADA = [POZO[0] + CHAFLAN_BORDE, POZO[1] + CHAFLAN_BORDE];
export const MEDIDAS_CASCADA = { semiancho: HUECO_CASCADA, altoBorde: MESA_Y + 0.35, hueco: HUECO_CASCADA, isla: [ISLA[0], ISLA[1]] };
const ALTO_CUERPO = 1.15;
const TRAMO = 0.5;
// Profundidad suficiente para que las hileras converjan hacia el punto de fuga.
const TRAMOS = 170;

export const ESTILOS_MESA = {
  hielo: { pared: 'liso', led: 'puntos', color: '#d8ecff', intensidad: 5.5, luz: '#7fb4ff', brillo: 1.1, ambiente: 0.02, separacion: 0.26, vidrio: '#0a1220', r: 0.945 },
  violeta: { pared: 'liso', led: 'puntos', color: '#c690ff', intensidad: 6.5, luz: '#8a3dff', brillo: 1.3, ambiente: 0.02, separacion: 0.26, vidrio: '#130a1e', r: 0.945 },
  ladrillo: { pared: 'ladrillo', led: 'bombillas', color: '#ffdca6', intensidad: 9, luz: '#ffae5e', brillo: 1.3, ambiente: 0.05, separacion: 2.4, vidrio: '#150c06', r: 0.935, cada: 2, plantas: true },
};

// Copias sin el recorte de la intro: la mesa ya está cuando se materializa el tablero.
const ACERO_MESA = Object.assign(MATERIAL_ACERO.clone(), { clippingPlanes: null });
// El chaflán de la isla es de vidrio negro, como el marco del tablero.
const VIDRIO_NEGRO_MESA = Object.assign(MATERIAL_VIDRIO_NEGRO.clone(), { clippingPlanes: null });
const LATON_MESA = Object.assign(MATERIAL_LATON.clone(), { clippingPlanes: null });
// Tira de luz embutida en la piedra, junto al quiebre del chaflán: un canal con
// un difusor esmerilado (más claro al centro, con las paredes del canal en
// sombra y un leve rastro de los LEDs de atrás), un labio fino de piedra hasta el
// chaflán y un resplandor corto sobre la piedra. Se calcula con la distancia al
// rectángulo redondeado de la cara de arriba, así sigue el borde exacto.
const vertexBordeIsla = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vXZ = (modelMatrix * vec4(position, 1.0)).xz;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const fragmentBordeIsla = /* glsl */ `
  uniform vec3 uColor;
  uniform vec2 uMedio;
  uniform float uRadio;
  varying vec2 vXZ;
  float caja(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    // Distancia hacia adentro desde el quiebre del chaflán.
    float dentro = -caja(vXZ, uMedio, uRadio);
    const float LABIO = 0.02;
    const float ANCHO = 0.085;
    float aa = fwidth(dentro);
    float x = dentro - LABIO;

    // El canal: tapa el piso con el difusor encendido.
    float canal = smoothstep(-aa, aa, x) * (1.0 - smoothstep(ANCHO - aa, ANCHO + aa, x));
    float t = clamp(x / ANCHO, 0.0, 1.0);
    float perfil = mix(0.55, 1.0, pow(sin(3.14159 * t), 0.6));
    // La luz se mete debajo de las paredes del canal.
    float paredes = exp(-max(x, 0.0) / 0.006) + exp(-max(ANCHO - x, 0.0) / 0.006);
    // Rastro muy leve de los LEDs detrás del difusor.
    vec2 q = abs(vXZ) - uMedio;
    float aLoLargo = q.x > q.y ? vXZ.y : vXZ.x;
    float leds = 1.0 + 0.035 * cos(aLoLargo * 6.2832 / 0.05);
    vec3 difusor = uColor * perfil * leds * (1.0 - 0.5 * clamp(paredes, 0.0, 1.0));

    // Fuera del canal: un filo de sombra donde la piedra se corta y un resplandor
    // corto que no se aleja de la tira.
    float fuera = x < 0.0 ? -x : x - ANCHO;
    float filo = exp(-max(fuera, 0.0) / 0.006) * (1.0 - canal) * 0.3;
    float resplandor = (x < 0.0 ? exp(-fuera / 0.012) * 0.14 : exp(-fuera / 0.07) * 0.2) * (1.0 - canal);

    // Premultiplicado: el canal reemplaza la piedra, la sombra la oscurece y el
    // resplandor se suma.
    vec3 color = difusor * canal + uColor * resplandor;
    gl_FragColor = vec4(color, canal + filo);
  }
`;

const MATERIAL_BORDE_ISLA = new THREE.ShaderMaterial({
  vertexShader: vertexBordeIsla,
  fragmentShader: fragmentBordeIsla,
  uniforms: {
    uColor: { value: new THREE.Color('#d4e9ff').multiplyScalar(1.2) },
    uMedio: { value: new THREE.Vector2(ISLA_SUPERIOR[0], ISLA_SUPERIOR[1]) },
    uRadio: { value: 0.04 },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  toneMapped: false,
});

const MATERIAL_MARCO_MESA = new THREE.MeshPhysicalMaterial({
  color: '#2b2e34',
  metalness: 0.85,
  roughness: 0.36,
  clearcoat: 0.4,
  clearcoatRoughness: 0.3,
  envMapIntensity: 1.1,
});

const STENCIL_MASCARA = {
  colorWrite: false,
  depthWrite: false,
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc,
  stencilZPass: THREE.ReplaceStencilOp,
};
const STENCIL_POZO = {
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp,
};

function rectangulo(objeto, mx, mz, radio = 0.06) {
  const r = Math.min(radio, mx, mz);
  objeto.moveTo(-mx + r, -mz);
  objeto.lineTo(mx - r, -mz);
  objeto.quadraticCurveTo(mx, -mz, mx, -mz + r);
  objeto.lineTo(mx, mz - r);
  objeto.quadraticCurveTo(mx, mz, mx - r, mz);
  objeto.lineTo(-mx + r, mz);
  objeto.quadraticCurveTo(-mx, mz, -mx, mz - r);
  objeto.lineTo(-mx, -mz + r);
  objeto.quadraticCurveTo(-mx, -mz, -mx + r, -mz);
}

function anillo([ex, ez], [ix, iz], radioExt = 0.06, radioInt = 0.06) {
  const forma = new THREE.Shape();
  rectangulo(forma, ex, ez, radioExt);
  const agujero = new THREE.Path();
  rectangulo(agujero, ix, iz, radioInt);
  forma.holes.push(agujero);
  return forma;
}

function anilloPlano(ext, int, radioExt, radioInt) {
  const geometria = new THREE.ShapeGeometry(anillo(ext, int, radioExt, radioInt), 12);
  geometria.rotateX(-Math.PI / 2);
  return geometria;
}

// Isla con chaflán: cara de arriba más chica (de piedra) y cuatro caras
// inclinadas a 45° (de vidrio negro) que bajan hasta el contorno de la isla. Las
// UV son planas en XZ, como en el plano de antes.
function geometriaIslaChaflan(ix, iz, c) {
  const ax = ix - c;
  const az = iz - c;
  const caida = -c;
  const armar = (caras) => {
    const posiciones = [];
    const agregar = (...puntos) => puntos.forEach((p) => posiciones.push(...p));
    caras.forEach(([a, b, cc, d, haciaAfuera]) => {
      // Dos triángulos; se da vuelta el orden si la normal no apunta hacia afuera.
      const u = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
      const v = new THREE.Vector3(...cc).sub(new THREE.Vector3(...a));
      const n = new THREE.Vector3().crossVectors(u, v);
      if (n.dot(new THREE.Vector3(...haciaAfuera)) < 0) agregar(a, cc, b, a, d, cc);
      else agregar(a, b, cc, a, cc, d);
    });
    const uvs = [];
    for (let i = 0; i < posiciones.length; i += 3) {
      uvs.push((posiciones[i] + ix) / (2 * ix), (-posiciones[i + 2] + iz) / (2 * iz));
    }
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
    geometria.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometria.computeVertexNormals();
    return geometria;
  };
  return {
    superior: armar([[[-ax, 0, -az], [ax, 0, -az], [ax, 0, az], [-ax, 0, az], [0, 1, 0]]]),
    chaflan: armar([
      [[-ax, 0, az], [ax, 0, az], [ix, caida, iz], [-ix, caida, iz], [0, 1, 1]],
      [[ax, 0, -az], [-ax, 0, -az], [-ix, caida, -iz], [ix, caida, -iz], [0, 1, -1]],
      [[ax, 0, az], [ax, 0, -az], [ix, caida, -iz], [ix, caida, iz], [1, 1, 0]],
      [[-ax, 0, -az], [-ax, 0, az], [-ix, caida, iz], [-ix, caida, -iz], [-1, 1, 0]],
    ]),
  };
}

// Paredes del pozo: lados exteriores (miran hacia adentro) y de la isla (hacia afuera).
function segmentosPared() {
  const [ox, oz] = POZO;
  const [ix, iz] = ISLA;
  return [
    { a: [-ox, oz], b: [ox, oz], n: [0, -1] },
    { a: [ox, oz], b: [ox, -oz], n: [-1, 0] },
    { a: [ox, -oz], b: [-ox, -oz], n: [0, 1] },
    { a: [-ox, -oz], b: [-ox, oz], n: [1, 0] },
    { a: [-ix, iz], b: [ix, iz], n: [0, 1], isla: true },
    { a: [ix, iz], b: [ix, -iz], n: [1, 0], isla: true },
    { a: [ix, -iz], b: [-ix, -iz], n: [0, -1], isla: true },
    { a: [-ix, -iz], b: [-ix, iz], n: [-1, 0], isla: true },
  ];
}

function geometriaParedes() {
  const posiciones = [];
  const uvs = [];
  const tramos = [];
  const indices = [];
  const anchoTextura = 1.2;
  let vertice = 0;
  for (let t = 0; t < TRAMOS; t += 1) {
    const y0 = -t * TRAMO;
    const y1 = -(t + 1) * TRAMO;
    let recorrido = 0;
    for (const { a, b } of segmentosPared()) {
      const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u0 = recorrido / anchoTextura;
      const u1 = (recorrido + largo) / anchoTextura;
      recorrido += largo;
      posiciones.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
      uvs.push(u0, 0, u1, 0, u1, 1, u0, 1);
      tramos.push(t, t, t, t);
      indices.push(vertice, vertice + 1, vertice + 2, vertice, vertice + 2, vertice + 3);
      vertice += 4;
    }
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometria.setAttribute('aTramo', new THREE.Float32BufferAttribute(tramos, 1));
  geometria.setIndex(indices);
  return geometria;
}

// --- Onda de color al capturar ----------------------------------------------
// Los uniforms viven en onda.js: un solo disparo colorea paredes, LEDs, el
// resplandor que sale por el vidrio y las casillas del tablero de luz.

// Degradé violeta → rosa → ámbar, de ida y vuelta (sin saltos entre extremos):
// la onda de cada captura y el festejo de fin de partida.
const VIOLETA = new THREE.Color('#7b3cff');
const ROSA = new THREE.Color('#ff4fa3');
const AMBAR = new THREE.Color('#ffc44a');
function paletaOnda(t, destino) {
  const x = 1 - Math.abs((((t * 0.5) % 1) + 1) % 1 * 2 - 1);
  return x < 0.5
    ? destino.copy(VIOLETA).lerp(ROSA, x * 2)
    : destino.copy(ROSA).lerp(AMBAR, (x - 0.5) * 2);
}

const ondaGLSL = /* glsl */ `
  uniform float uTiempo;
  uniform float uInicioOnda;
  uniform vec2 uOrigenOnda;
  uniform float uFiesta;
  vec3 paletaOnda(float t) {
    float x = 1.0 - abs(fract(t * 0.5) * 2.0 - 1.0);
    // Mismos tonos que en JS (#7b3cff, #ff4fa3, #ffc44a), en espacio lineal.
    vec3 violeta = vec3(0.198, 0.045, 1.0);
    vec3 rosa = vec3(1.0, 0.078, 0.366);
    vec3 ambar = vec3(1.0, 0.552, 0.069);
    return x < 0.5 ? mix(violeta, rosa, smoothstep(0.0, 1.0, x * 2.0))
                   : mix(rosa, ambar, smoothstep(0.0, 1.0, x * 2.0 - 1.0));
  }
  // Festejo: anillos de degradé que salen sin parar del centro de la mesa y
  // bajan por los reflejos, mientras la partida está terminada.
  vec3 fiesta(vec3 p) {
    if (uFiesta < 0.001) return vec3(0.0);
    float d = length(p.xz) - p.y * 0.8;
    float bandas = 0.5 + 0.5 * sin(d * 0.9 - uTiempo * 3.2);
    return paletaOnda(d * 0.16 - uTiempo * 0.9) * (0.45 + 0.75 * bandas) * uFiesta;
  }
  // p en coordenadas del pozo (y <= 0): la onda avanza desde la captura,
  // recorre la mesa y baja por los reflejos con un leve retraso.
  vec3 ondaCaptura(vec3 p) {
    float t = uTiempo - uInicioOnda;
    if (t < 0.0 || t > ${DURACION_ONDA.toFixed(1)}) return vec3(0.0);
    float d = length(p.xz - uOrigenOnda) - p.y * 0.8;
    // Dos anillos de color que se persiguen, con una estela que tiñe lo recorrido.
    float frente = t * 7.0;
    float segundo = max(0.0, t - 0.6) * 7.0;
    float banda = exp(-pow((d - frente) / 2.4, 2.0)) + 0.75 * exp(-pow((d - segundo) / 2.0, 2.0));
    // Todo lo recorrido queda teñido (con las bandas en movimiento) hasta que se apaga.
    float estela = smoothstep(frente + 1.0, frente - 2.0, d) * 0.55;
    float vida = 1.0 - smoothstep(4.8, ${DURACION_ONDA.toFixed(1)}, t);
    // Varias vueltas del degradé a lo ancho de la mesa, que además giran rápido.
    return paletaOnda(d * 0.16 - t * 1.8) * (banda * 1.4 + estela) * vida;
  }
  vec3 onda(vec3 p) {
    return ondaCaptura(p) + fiesta(p);
  }
`;

const vertexParedes = /* glsl */ `
  attribute float aTramo;
  varying vec2 vUv;
  varying float vTramo;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vTramo = aTramo;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentParedes = /* glsl */ `
  uniform sampler2D uMapa;
  uniform float uUsarMapa;
  uniform vec3 uAlbedo;
  uniform vec3 uLuz;
  uniform float uBrillo;
  uniform float uAmbiente;
  uniform float uR;
  uniform float uCada;
  uniform float uEscalaV;
  uniform float uTramos;
  uniform float uBombillas;
  uniform vec2 uIsla;
  uniform float uChaflan;
  uniform float uChaflanBorde;
  varying vec2 vUv;
  varying float vTramo;
  varying vec3 vPos;
  ${ondaGLSL}
  void main() {
    // La pared de la isla arranca debajo del chaflán: más arriba está la piedra.
    bool deIsla = abs(vPos.x) < uIsla.x + 0.01 && abs(vPos.z) < uIsla.y + 0.01;
    if (deIsla && vPos.y > -uChaflan) discard;
    // Con la cascada, la pared de afuera arranca debajo del chaflán del cartel.
    if (!deIsla && vPos.y > -uChaflanBorde) discard;
    // Paredes con textura (ladrillo, plantas) o lisas como un espejo ahumado.
    vec3 albedo = uUsarMapa > 0.5
      ? texture2D(uMapa, vec2(vUv.x, (vTramo + vUv.y) * uEscalaV)).rgb
      : uAlbedo;
    float v = (mod(vTramo, uCada) + vUv.y) / uCada;
    float luz = exp(-v * 2.4) + 0.55 * exp(-(1.0 - v) * 3.0);
    // Con bombillas la luz se centra en cada una y hay un fondo cálido: el
    // ladrillo nunca queda negro entre hileras.
    luz = mix(luz, 0.32 + exp(-pow((v - 0.26) / 0.3, 2.0)) + 0.35 * exp(-(1.0 - v) * 3.0), uBombillas);
    float profundidad = vTramo + vUv.y;
    // Cada rebote pierde luz: el túnel se apaga de a poco hasta el negro total.
    float atenuacion = pow(uR, profundidad);
    float fin = 1.0 - smoothstep(uTramos * 0.7, uTramos, profundidad);
    vec3 color = albedo * (uAmbiente + uLuz * uBrillo * luz) * atenuacion;
    color += uLuz * uBrillo * 0.012 * pow(uR, profundidad * 0.5) * fin;
    color += onda(vPos) * (albedo * 6.0 + uLuz * 0.06) * pow(uR, profundidad * 0.5) * fin;
    gl_FragColor = vec4(color * fin, 1.0);
  }
`;

// LEDs como puntos de luz: siempre ocupan al menos ~1.5 px y su energía se
// reparte, así las hileras lejanas convergen en un halo en vez de cortarse.
const vertexPuntos = /* glsl */ `
  attribute vec3 color;
  uniform float uTam;
  uniform float uEscala;
  uniform float uR;
  uniform float uTramo;
  uniform float uIntensidadOnda;
  varying vec3 vColor;
  ${ondaGLSL}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float px = uTam * uEscala / -mv.z;
    float tam = max(px, 1.6);
    vec3 w = onda(position);
    float aten = pow(uR, -position.y / uTramo);
    vec3 base = color * (1.0 - 0.7 * clamp(dot(w, vec3(0.4)), 0.0, 1.0));
    vColor = (base + w * uIntensidadOnda * aten) * clamp((px * px) / (tam * tam), 0.0, 1.0);
    gl_PointSize = tam;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentPuntos = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d * d * 3.5) * step(d, 1.0);
    gl_FragColor = vec4(vColor, a);
  }
`;

// Bombillas y tiras instanciadas, con la misma onda que los puntos.
const vertexLedsMalla = /* glsl */ `
  uniform float uR;
  uniform float uTramo;
  uniform float uIntensidadOnda;
  varying vec3 vColor;
  ${ondaGLSL}
  void main() {
    vec4 local = instanceMatrix * vec4(position, 1.0);
    #ifdef USE_INSTANCING_COLOR
      vec3 base = instanceColor;
    #else
      vec3 base = vec3(1.0);
    #endif
    vec3 w = onda(local.xyz);
    float aten = pow(uR, -local.y / uTramo);
    vColor = base * (1.0 - 0.7 * clamp(dot(w, vec3(0.4)), 0.0, 1.0)) + w * uIntensidadOnda * aten;
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

const fragmentLedsMalla = /* glsl */ `
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

function posicionesLeds(estilo, desde, hasta, borde) {
  const lista = [];
  const fila = 0.08;
  for (let t = desde; t < hasta; t += estilo.cada ?? 1) {
    const y = -t * TRAMO - fila - (estilo.led === 'bombillas' ? 0.18 : 0);
    const atenuacion = Math.pow(estilo.r, t + fila);
    for (const { a, b, n, isla } of segmentosPared()) {
      if (estilo.led === 'bombillas' && isla) continue;
      if (isla ? y > -CHAFLAN : y > -borde) continue;
      const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dir = [(b[0] - a[0]) / largo, (b[1] - a[1]) / largo];
      if (estilo.led === 'tira') {
        lista.push({ pos: [(a[0] + b[0]) / 2 + n[0] * 0.02, y, (a[1] + b[1]) / 2 + n[1] * 0.02], n, largo, atenuacion });
        continue;
      }
      const despegue = estilo.led === 'bombillas' ? 0.22 : 0.04;
      const cantidad = Math.max(1, Math.floor(largo / estilo.separacion));
      const paso = largo / cantidad;
      for (let i = 0; i < cantidad; i += 1) {
        const d = paso * (i + 0.5);
        lista.push({ pos: [a[0] + dir[0] * d + n[0] * despegue, y, a[1] + dir[1] * d + n[1] * despegue], n, atenuacion });
      }
    }
  }
  return lista;
}

function LedsMalla({ estilo, instancias }) {
  const ref = useRef(null);
  const geometria = useMemo(
    () => (estilo.led === 'tira' ? new THREE.BoxGeometry(1, 0.045, 0.03) : new THREE.SphereGeometry(0.1, 14, 10)),
    [estilo.led],
  );
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertexLedsMalla,
    fragmentShader: fragmentLedsMalla,
    uniforms: {
      ...ONDA,
      uR: { value: estilo.r },
      uTramo: { value: TRAMO },
      uIntensidadOnda: { value: estilo.intensidad * 1.6 },
    },
    toneMapped: false,
    ...STENCIL_POZO,
  }), [estilo]);

  useLayoutEffect(() => {
    const malla = ref.current;
    if (!malla) return;
    const matriz = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const escala = new THREE.Vector3();
    const posicion = new THREE.Vector3();
    const color = new THREE.Color();
    const base = new THREE.Color(estilo.color);
    instancias.forEach((inst, i) => {
      posicion.set(...inst.pos);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(inst.n[0], inst.n[1]));
      escala.set(inst.largo ?? 1, 1, 1);
      matriz.compose(posicion, q, escala);
      malla.setMatrixAt(i, matriz);
      malla.setColorAt(i, color.copy(base).multiplyScalar(estilo.intensidad * inst.atenuacion));
    });
    malla.instanceMatrix.needsUpdate = true;
    if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
  }, [instancias, estilo]);

  if (!instancias.length) return null;
  return (
    <instancedMesh
      key={`${estilo.led}-${instancias.length}`}
      ref={ref}
      args={[geometria, material, instancias.length]}
      renderOrder={-1}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}

const tmpTam = new THREE.Vector2();

function LedsPuntos({ estilo, instancias, tam }) {
  const { gl, camera } = useThree();
  const geometria = useMemo(() => {
    const posiciones = new Float32Array(instancias.length * 3);
    const colores = new Float32Array(instancias.length * 3);
    const base = new THREE.Color(estilo.color);
    instancias.forEach((inst, i) => {
      posiciones.set(inst.pos, i * 3);
      const k = estilo.intensidad * inst.atenuacion;
      colores.set([base.r * k, base.g * k, base.b * k], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    return geo;
  }, [instancias, estilo]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertexPuntos,
    fragmentShader: fragmentPuntos,
    uniforms: {
      ...ONDA,
      uTam: { value: tam },
      uEscala: { value: 800 },
      uR: { value: estilo.r },
      uTramo: { value: TRAMO },
      uIntensidadOnda: { value: estilo.intensidad * 1.6 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    ...STENCIL_POZO,
  }), [tam, estilo]);

  useFrame(() => {
    const alto = gl.getDrawingBufferSize(tmpTam).y;
    material.uniforms.uEscala.value = alto / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  });

  if (!instancias.length) return null;
  return <points geometry={geometria} material={material} renderOrder={-1} frustumCulled={false} raycast={() => null} />;
}

// --- Plantas colgantes del pozo de ladrillo ----------------------------------
// Matas de hojas que caen desde el borde de cada hilera, con algunas flores.
// Como el resto del pozo, se repiten en cada reflejo y se apagan con la
// profundidad. Hojas y flores son quads con silueta calculada en el shader.
//
// El jardín se arma en un bloque de HILERAS_CON_PLANTAS hileras; debajo se
// repite COPIAS_JARDIN veces (sin los cortes del borde de arriba) para que las
// plantas sigan hasta que el pozo se apaga, como las paredes y las bombillas.

const HILERAS_CON_PLANTAS = 26;
const ALTO_BLOQUE_JARDIN = HILERAS_CON_PLANTAS * TRAMO;
const COPIAS_JARDIN = 2;
const VERDES = ['#1f4d1c', '#2f6b2a', '#3f8a34', '#57a23c', '#6fb648'];
const FLORES = ['#ff8fb8', '#fff3ef', '#ffd45a', '#c79bff', '#ff6f91'];

// Generador pseudoaleatorio con semilla: el jardín es siempre el mismo.
function azarConSemilla(semilla) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const vertexPlanta = /* glsl */ `
  attribute vec3 aColor;
  uniform float uR;
  uniform float uTramo;
  uniform vec3 uLuz;
  uniform float uBrillo;
  uniform float uAmbiente;
  uniform float uBajada;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vec4 local = instanceMatrix * vec4(position, 1.0);
    local.y -= uBajada;
    float profundidad = -local.y / uTramo;
    // Iluminadas por la hilera de bombillas, que tienen justo debajo.
    vec3 luz = uAmbiente + uLuz * uBrillo * 0.8;
    vColor = aColor * luz * pow(uR, profundidad);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

const fragmentHoja = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    float u = vUv.x - 0.5;
    float v = vUv.y;
    // Silueta de hoja lanceolada: ancha al centro, en punta en la base y el extremo.
    float ancho = 0.5 * pow(sin(3.14159 * v), 0.75) * (1.0 - 0.3 * v);
    float aa = fwidth(u);
    if (abs(u) > ancho + aa) discard;
    float vena = smoothstep(0.035, 0.0, abs(u)) * 0.3;
    float brillo = 0.7 + 0.4 * v + 0.15 * (1.0 - abs(u) / max(ancho, 0.001));
    gl_FragColor = vec4(vColor * brillo * (1.0 - vena), 1.0);
  }
`;

// --- Enredaderas -------------------------------------------------------------
// Hiedra común: tallos leñosos que se afinan hacia la punta y se ramifican, con
// hojas de cinco lóbulos curvadas en 3D (nervio central abombado, bordes hacia
// el muro), brillo de hoja encerada y nervaduras claras.

// Luz principal del pozo: las bombillas quedan arriba de cada hilera.
const LUZ_POZO = new THREE.Vector3(0, 1, 0.25).normalize();

const vertexHiedra = /* glsl */ `
  attribute vec3 aColor;
  uniform float uR;
  uniform float uTramo;
  uniform float uBajada;
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vMundo;
  varying float vNiebla;
  void main() {
    // Lámina curvada: abombada sobre el nervio central y con la punta caída.
    vec3 p = position;
    float y = p.y + 0.5;
    p.z = -0.7 * p.x * p.x - 0.14 * y * y;
    vec3 n = vec3(1.4 * p.x, 0.28 * y, 1.0);
    vec4 local = instanceMatrix * vec4(p, 1.0);
    local.y -= uBajada;
    vNiebla = pow(uR, -local.y / uTramo);
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
    vec4 mundo = modelMatrix * local;
    vMundo = mundo.xyz;
    vColor = aColor;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * mundo;
  }
`;

// Iluminación compartida por hojas y tallos: difusa envolvente, translucidez y brillo.
const luzPlanta = /* glsl */ `
  uniform vec3 uLuz;
  uniform float uBrillo;
  uniform float uAmbiente;
  uniform vec3 uDirLuz;
  vec3 iluminar(vec3 albedo, vec3 n, vec3 v, float lustre) {
    float d = dot(n, uDirLuz);
    float difusa = max(d, 0.0) * 0.8 + 0.2;
    float traslucida = max(-d, 0.0) * 0.35;
    vec3 h = normalize(uDirLuz + v);
    float especular = pow(max(dot(n, h), 0.0), 48.0) * lustre;
    vec3 luz = uLuz * uBrillo;
    return albedo * (uAmbiente + luz * (difusa + traslucida * vec3(0.7, 1.0, 0.4))) + luz * especular;
  }
`;

const fragmentHiedra = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vMundo;
  varying float vNiebla;
  ${luzPlanta}
  void main() {
    // Silueta de hiedra en polares desde la unión del pecíolo: cinco lóbulos
    // en punta (el central más largo) y la base acorazonada.
    vec2 q = (vUv - 0.5) * 2.0 - vec2(0.0, -0.2);
    float r = length(q);
    float ang = atan(q.x, q.y);
    float lobulos = pow(abs(cos(2.5 * ang)), 1.15);
    float borde = 0.6 * (0.64 + 0.36 * lobulos) * (1.0 + 0.24 * cos(ang));
    float aa = fwidth(r) * 1.2;
    float alfa = 1.0 - smoothstep(borde - aa, borde + aa, r);
    if (alfa < 0.02) discard;

    // Nervaduras palmeadas que salen del pecíolo hacia cada lóbulo.
    float ancho = mix(0.03, 0.008, clamp(r / borde, 0.0, 1.0));
    float nervio = (1.0 - smoothstep(ancho * 0.4, ancho, abs(sin(2.5 * ang)) * r)) * smoothstep(1.0, 0.3, r / borde);
    float margen = smoothstep(0.75, 1.0, r / borde);
    vec3 albedo = vColor * (1.0 - 0.25 * margen);
    albedo = mix(albedo, albedo * 1.9 + vec3(0.05, 0.07, 0.03), nervio * 0.6);

    vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 v = normalize(cameraPosition - vMundo);
    vec3 color = iluminar(albedo, n, v, 0.55 * (1.0 - nervio * 0.5));
    gl_FragColor = vec4(color * vNiebla, alfa);
  }
`;

const vertexTallo = /* glsl */ `
  attribute vec3 aColor;
  uniform float uR;
  uniform float uTramo;
  uniform float uBajada;
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vMundo;
  varying float vNiebla;
  void main() {
    vec3 p = position - vec3(0.0, uBajada, 0.0);
    vNiebla = pow(uR, -p.y / uTramo);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mundo = modelMatrix * vec4(p, 1.0);
    vMundo = mundo.xyz;
    vColor = aColor;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * mundo;
  }
`;

// Corteza: vetas finas a lo largo del tallo.
const fragmentTallo = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vMundo;
  varying float vNiebla;
  ${luzPlanta}
  void main() {
    float vetas = 0.86 + 0.14 * sin(vUv.y * 6.2832 * 3.0 + sin(vUv.x * 90.0) * 0.8);
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vMundo);
    gl_FragColor = vec4(iluminar(vColor * vetas, n, v, 0.12) * vNiebla, 1.0);
  }
`;

const fragmentFlor = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    // Cinco pétalos redondeados y un centro dorado.
    float borde = 0.55 + 0.42 * abs(cos(2.5 * ang));
    float aa = fwidth(r);
    if (r > borde + aa) discard;
    float centro = smoothstep(0.24 + aa, 0.24 - aa, r);
    float sombra = 0.75 + 0.25 * (1.0 - r / borde);
    vec3 dorado = vec3(1.0, 0.62, 0.12) * (length(vColor) / 1.4 + 0.2);
    gl_FragColor = vec4(mix(vColor * sombra, dorado, centro), 1.0);
  }
`;

// continuo: bloque para las copias de abajo, sin cortes en el borde de arriba
// (ahí sigue el bloque anterior).
function generarJardin(estilo, borde, continuo = false) {
  const azar = azarConSemilla(1337);
  const hojas = [];
  const flores = [];
  const arriba = new THREE.Vector3(0, 1, 0);
  const tangente = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const punta = new THREE.Vector3();
  const lado = new THREE.Vector3();
  const frente = new THREE.Vector3();
  const base = new THREE.Vector3();
  const color = new THREE.Color();

  for (let t = 0; t < HILERAS_CON_PLANTAS; t += estilo.cada ?? 1) {
    const yFila = -t * TRAMO - 0.02;
    for (const { a, b, n, isla } of segmentosPared()) {
      if (!continuo && (isla ? yFila > -CHAFLAN : yFila > -borde)) continue;
      const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
      tangente.set((b[0] - a[0]) / largo, 0, (b[1] - a[1]) / largo);
      normal.set(n[0], 0, n[1]);
      const matas = Math.floor(largo / 0.3);
      for (let m = 0; m < matas; m += 1) {
        const d = (m + 0.2 + azar() * 0.6) * (largo / matas);
        const cx = a[0] + tangente.x * d;
        const cz = a[1] + tangente.z * d;
        const cantidad = 7 + Math.floor(azar() * 6);
        for (let h = 0; h < cantidad; h += 1) {
          // Cada hoja cae hacia abajo y un poco hacia el pozo, con algo de giro.
          const caida = 0.25 + azar() * 0.75;
          punta.copy(arriba).multiplyScalar(-Math.cos(caida))
            .addScaledVector(normal, Math.sin(caida))
            .addScaledVector(tangente, (azar() - 0.5) * 0.9)
            .normalize();
          lado.crossVectors(punta, normal).normalize();
          frente.crossVectors(lado, punta).normalize();
          const largoHoja = 0.16 + azar() * 0.2;
          const anchoHoja = largoHoja * (0.38 + azar() * 0.16);
          base.set(cx + tangente.x * (azar() - 0.5) * 0.3, yFila - azar() * 0.06, cz + tangente.z * (azar() - 0.5) * 0.3)
            .addScaledVector(normal, 0.02 + azar() * 0.07);
          const matriz = new THREE.Matrix4().makeBasis(
            lado.clone().multiplyScalar(anchoHoja),
            punta.clone().multiplyScalar(largoHoja),
            frente.clone(),
          ).setPosition(base);
          color.set(VERDES[Math.floor(azar() * VERDES.length)]);
          hojas.push({ matriz, color: color.clone() });
        }
        if (azar() < 0.55) {
          const cantidadFlores = 1 + Math.floor(azar() * 2);
          for (let f = 0; f < cantidadFlores; f += 1) {
            const tam = 0.09 + azar() * 0.07;
            base.set(cx + tangente.x * (azar() - 0.5) * 0.25, yFila - 0.05 - azar() * 0.14, cz + tangente.z * (azar() - 0.5) * 0.25)
              .addScaledVector(normal, 0.1 + azar() * 0.06);
            // Mira hacia el pozo, apenas inclinada hacia arriba.
            frente.copy(normal).addScaledVector(arriba, 0.35).normalize();
            lado.crossVectors(arriba, frente).normalize();
            punta.crossVectors(frente, lado).normalize();
            const giro = azar() * Math.PI;
            const l = lado.clone().multiplyScalar(Math.cos(giro)).addScaledVector(punta, Math.sin(giro));
            const p = punta.clone().multiplyScalar(Math.cos(giro)).addScaledVector(lado, -Math.sin(giro));
            const matriz = new THREE.Matrix4().makeBasis(l.multiplyScalar(tam), p.multiplyScalar(tam), frente.clone()).setPosition(base);
            color.set(FLORES[Math.floor(azar() * FLORES.length)]);
            flores.push({ matriz, color: color.clone().multiplyScalar(1.6) });
          }
        }
      }
    }
  }
  const { tallos, hiedras } = generarEnredaderas(estilo, azar, borde, continuo);
  return { hojas, flores, tallos, hiedras };
}

// Tallo que trepa por el muro: camina hacia arriba con un giro que cambia de a
// poco (curvas orgánicas, no una senoide) y rebota contra los bordes de la pared.
function crecerTallo(azar, { s, y, angulo, largo, yTope, sMin = -Infinity, sMax = Infinity, tendencia, PASO = 0.028, ruido = 0.16 }) {
  const puntos = [];
  let giro = 0;
  for (let recorrido = 0; recorrido <= largo && y < yTope; recorrido += PASO) {
    puntos.push([s, y]);
    giro = giro * 0.82 + (azar() - 0.5) * ruido;
    angulo += giro + (tendencia - angulo) * 0.05;
    s += Math.sin(angulo) * PASO;
    y += Math.cos(angulo) * PASO;
    if (s < sMin || s > sMax) {
      s = THREE.MathUtils.clamp(s, sMin, sMax);
      angulo *= -0.4;
    }
  }
  return puntos;
}

// Recorrido horizontal alrededor del pozo: un rectángulo de esquinas redondeadas
// (semiejes hx, hz). Devuelve el punto a la distancia u y la normal hacia afuera.
function puntoRecorrido(hx, hz, r, u) {
  const lx = 2 * (hx - r);
  const lz = 2 * (hz - r);
  const q = (Math.PI * r) / 2;
  const total = 2 * (lx + lz) + 4 * q;
  let d = ((u % total) + total) % total;
  const tramos = [
    { largo: lx, recta: (t) => [-hx + r + t, hz], n: [0, 1] },
    { largo: q, centro: [hx - r, hz - r], desde: Math.PI / 2 },
    { largo: lz, recta: (t) => [hx, hz - r - t], n: [1, 0] },
    { largo: q, centro: [hx - r, -hz + r], desde: 0 },
    { largo: lx, recta: (t) => [hx - r - t, -hz], n: [0, -1] },
    { largo: q, centro: [-hx + r, -hz + r], desde: -Math.PI / 2 },
    { largo: lz, recta: (t) => [-hx, -hz + r + t], n: [-1, 0] },
    { largo: q, centro: [-hx + r, hz - r], desde: Math.PI },
  ];
  for (let i = 0; i < tramos.length; i += 1) {
    const tramo = tramos[i];
    if (d <= tramo.largo || i === tramos.length - 1) {
      if (tramo.recta) {
        const [x, z] = tramo.recta(Math.min(d, tramo.largo));
        return { x, z, nx: tramo.n[0], nz: tramo.n[1] };
      }
      const a = tramo.desde - Math.min(d, tramo.largo) / r;
      return { x: tramo.centro[0] + Math.cos(a) * r, z: tramo.centro[1] + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) };
    }
    d -= tramo.largo;
  }
  return null;
}

const HOJAS_JOVENES = ['#7fb342', '#8cc04a', '#9ccf55'];
const HOJAS_ADULTAS = ['#3d6f2a', '#447a2e', '#4a8233', '#3a6a2c', '#52893a'];
const LADOS_TALLO = 6;
// Enredaderas en hélice: cada una da la vuelta al pozo pegada al muro, subiendo en
// diagonal desde el fondo hasta el borde. Pendiente = subida por unidad recorrida.
const HELICES = [
  { muro: 'exterior', cantidad: 30 },
  { muro: 'isla', cantidad: 18 },
];

function generarEnredaderas(estilo, azar, borde, continuo) {
  const pos = [];
  const nor = [];
  const col = [];
  const uvs = [];
  const indices = [];
  const hiedras = [];
  const arriba = new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3();
  const b = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const lado = new THREE.Vector3();
  const frente = new THREE.Vector3();
  const base = new THREE.Vector3();
  const color = new THREE.Color();
  const madera = new THREE.Color('#a07e56');
  const brote = new THREE.Color('#9aae55');

  // Pasa un camino (u = distancia alrededor del pozo, y = altura) a puntos 3D
  // pegados al muro, con la normal que mira al hueco del pozo.
  function aMuro(camino, muro, despegue = 0) {
    const exterior = muro === 'exterior';
    const separacion = 0.035 + despegue;
    const hx = exterior ? POZO[0] - separacion : ISLA[0] + separacion;
    const hz = exterior ? POZO[1] - separacion : ISLA[1] + separacion;
    const r = exterior ? 0.12 : 0.12 + separacion;
    return camino.map(([u, y]) => {
      const q = puntoRecorrido(hx, hz, r, u);
      const signo = exterior ? -1 : 1;
      return { p: new THREE.Vector3(q.x, y, q.z), n: new THREE.Vector3(q.nx * signo, 0, q.nz * signo) };
    });
  }

  // Tubo con radio decreciente; de color madera a verde brote.
  function tubo(puntos, radioBase, radioPunta) {
    const inicio = pos.length / 3;
    let recorrido = 0;
    puntos.forEach(({ p, n }, i) => {
      const previo = puntos[Math.max(0, i - 1)].p;
      const siguiente = puntos[Math.min(puntos.length - 1, i + 1)].p;
      if (i > 0) recorrido += p.distanceTo(previo);
      t.subVectors(siguiente, previo).normalize();
      b.crossVectors(t, n).normalize();
      nn.crossVectors(b, t).normalize();
      const k = i / (puntos.length - 1);
      const radio = THREE.MathUtils.lerp(radioBase, radioPunta, Math.pow(k, 0.8));
      color.copy(madera).lerp(brote, Math.pow(k, 1.5));
      for (let j = 0; j < LADOS_TALLO; j += 1) {
        const fi = (j / LADOS_TALLO) * Math.PI * 2;
        dir.copy(b).multiplyScalar(Math.cos(fi)).addScaledVector(nn, Math.sin(fi));
        pos.push(p.x + dir.x * radio, p.y + dir.y * radio, p.z + dir.z * radio);
        nor.push(dir.x, dir.y, dir.z);
        col.push(color.r, color.g, color.b);
        uvs.push(recorrido, j / LADOS_TALLO);
      }
    });
    for (let i = 0; i < puntos.length - 1; i += 1) {
      for (let j = 0; j < LADOS_TALLO; j += 1) {
        const a0 = inicio + i * LADOS_TALLO + j;
        const a1 = inicio + i * LADOS_TALLO + ((j + 1) % LADOS_TALLO);
        indices.push(a0, a0 + LADOS_TALLO, a1, a1, a0 + LADOS_TALLO, a1 + LADOS_TALLO);
      }
    }
  }

  function agregarHoja(tam, colorHoja) {
    lado.crossVectors(dir, frente).normalize();
    hiedras.push({
      matriz: new THREE.Matrix4().makeBasis(
        lado.clone().multiplyScalar(tam),
        dir.clone().multiplyScalar(tam),
        frente.clone().multiplyScalar(tam),
      ).setPosition(base),
      color: colorHoja.clone(),
    });
  }

  // Hojas alternas sobre pecíolos que las despegan del muro, mirando hacia la luz.
  // `juventud` dice desde qué fracción del tallo las hojas son tiernas.
  function hojasDe(puntos, tamBase, tamPunta, cada, juventud = 0.78) {
    for (let i = 2; i < puntos.length; i += cada) {
      const k = i / (puntos.length - 1);
      const signo = Math.floor(i / cada) % 2 === 0 ? 1 : -1;
      const { p, n } = puntos[i];
      t.subVectors(p, puntos[i - 1].p).normalize();
      b.crossVectors(t, n).normalize().multiplyScalar(signo);
      const tam = THREE.MathUtils.lerp(tamBase, tamPunta, k) * (0.8 + azar() * 0.4);
      // La punta cae hacia el costado y abajo; la lámina mira afuera y arriba.
      dir.copy(b).multiplyScalar(0.8).addScaledVector(arriba, -0.25 - azar() * 0.6).addScaledVector(t, (azar() - 0.5) * 0.6).normalize();
      frente.copy(n).addScaledVector(arriba, 0.35 + azar() * 0.5).addScaledVector(b, (azar() - 0.5) * 0.5);
      frente.addScaledVector(dir, -frente.dot(dir)).normalize();
      base.copy(p).addScaledVector(b, tam * 0.25).addScaledVector(n, tam * (0.2 + azar() * 0.15)).addScaledVector(dir, tam * 0.4);
      const paleta = k > juventud ? HOJAS_JOVENES : HOJAS_ADULTAS;
      color.set(paleta[Math.floor(azar() * paleta.length)]).multiplyScalar(0.85 + azar() * 0.3);
      agregarHoja(tam, color);
    }
    // Un brote de hojitas tiernas en la punta.
    const { p: ultimo, n } = puntos[puntos.length - 1];
    t.subVectors(ultimo, puntos[puntos.length - 2].p).normalize();
    for (let h = 0; h < 2; h += 1) {
      const tam = tamPunta * (0.6 + azar() * 0.3);
      dir.copy(t).addScaledVector(arriba, 0.6).addScaledVector(b.crossVectors(t, n).normalize(), (h - 0.5) * 1.2).normalize();
      frente.copy(n).addScaledVector(arriba, 0.3);
      frente.addScaledVector(dir, -frente.dot(dir)).normalize();
      base.copy(ultimo).addScaledVector(n, tam * 0.25).addScaledVector(dir, tam * 0.4);
      color.set(HOJAS_JOVENES[h % HOJAS_JOVENES.length]);
      agregarHoja(tam, color);
    }
  }

  const fondo = -ALTO_BLOQUE_JARDIN;
  for (const { muro, cantidad } of HELICES) {
    const yTope = continuo ? 0 : muro === 'isla' ? -CHAFLAN - 0.06 : -borde - 0.06;
    const perimetro = muro === 'exterior' ? 4 * (POZO[0] + POZO[1]) : 4 * (ISLA[0] + ISLA[1]);
    for (let h = 0; h < cantidad; h += 1) {
      // Todas giran en el mismo sentido, repartidas alrededor del pozo, con una
      // pendiente oblicua apenas distinta y un serpenteo suave.
      const pendiente = 0.36 + azar() * 0.12;
      const angulo = Math.PI / 2 - Math.atan(pendiente);
      const camino = crecerTallo(azar, {
        s: ((h + azar() * 0.5) / cantidad) * perimetro,
        y: fondo,
        angulo,
        tendencia: angulo,
        largo: ((yTope - fondo) / Math.sin(Math.atan(pendiente))) * 1.2,
        yTope,
        PASO: 0.045,
        ruido: 0.07,
      });
      if (camino.length < 8) continue;
      const puntos = aMuro(camino, muro);
      tubo(puntos, 0.042, 0.016);
      hojasDe(puntos, 0.5, 0.42, 5, 0.97);
      // Brotes laterales que se abren de la hélice hacia arriba.
      for (let i = 10; i < camino.length - 6; i += 1) {
        if (azar() > 0.022) continue;
        const signo = azar() < 0.35 ? -1 : 1;
        const rama = crecerTallo(azar, {
          s: camino[i][0],
          y: camino[i][1],
          angulo: signo * (0.3 + azar() * 0.6),
          tendencia: signo * 0.25,
          largo: 0.4 + azar() * 0.6,
          yTope,
        });
        if (rama.length < 4) continue;
        const puntosRama = aMuro(rama, muro, 0.004);
        tubo(puntosRama, 0.024, 0.008);
        hojasDe(puntosRama, 0.42, 0.24, 6);
      }
    }
  }

  const tallos = new THREE.BufferGeometry();
  tallos.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tallos.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  tallos.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  tallos.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  tallos.setIndex(indices);
  return { tallos, hiedras };
}

const GEOMETRIA_HOJA = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const GEOMETRIA_FLOR = new THREE.PlaneGeometry(1, 1);

const GEOMETRIA_HIEDRA = new THREE.PlaneGeometry(1, 1, 4, 4);

function uniformesPlanta(estilo, bajada) {
  return {
    uBajada: { value: bajada },
    uR: { value: estilo.r },
    uTramo: { value: TRAMO },
    uLuz: { value: new THREE.Color(estilo.luz) },
    uBrillo: { value: estilo.brillo },
    uAmbiente: { value: estilo.ambiente + 0.14 },
    uDirLuz: { value: LUZ_POZO },
  };
}

function InstanciasPlanta({ lista, geometria, vertexShader = vertexPlanta, fragmentShader, estilo, bajada, alfaCobertura = false }) {
  const ref = useRef(null);
  const geo = useMemo(() => {
    const g = geometria.clone();
    const colores = new Float32Array(lista.length * 3);
    lista.forEach(({ color }, i) => colores.set([color.r, color.g, color.b], i * 3));
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(colores, 3));
    return g;
  }, [lista, geometria]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: uniformesPlanta(estilo, bajada),
    side: THREE.DoubleSide,
    // Bordes de hoja suavizados por el MSAA en lugar de un recorte duro.
    alphaToCoverage: alfaCobertura,
    ...STENCIL_POZO,
  }), [vertexShader, fragmentShader, estilo, bajada, alfaCobertura]);

  useLayoutEffect(() => {
    const malla = ref.current;
    if (!malla) return;
    lista.forEach(({ matriz }, i) => malla.setMatrixAt(i, matriz));
    malla.instanceMatrix.needsUpdate = true;
  }, [lista]);

  return (
    <instancedMesh
      ref={ref}
      args={[geo, material, lista.length]}
      renderOrder={-1}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}

function TallosEnredadera({ geometria, estilo, bajada }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertexTallo,
    fragmentShader: fragmentTallo,
    uniforms: uniformesPlanta(estilo, bajada),
    ...STENCIL_POZO,
  }), [estilo, bajada]);
  return <mesh geometry={geometria} material={material} renderOrder={-1} frustumCulled={false} raycast={() => null} />;
}

// Un bloque del jardín, bajado `bajada` unidades.
function BloqueJardin({ datos: { hojas, flores, tallos, hiedras }, estilo, bajada }) {
  return (
    <>
      <TallosEnredadera geometria={tallos} estilo={estilo} bajada={bajada} />
      <InstanciasPlanta lista={hiedras} geometria={GEOMETRIA_HIEDRA} vertexShader={vertexHiedra} fragmentShader={fragmentHiedra} estilo={estilo} bajada={bajada} alfaCobertura />
      <InstanciasPlanta lista={hojas} geometria={GEOMETRIA_HOJA} fragmentShader={fragmentHoja} estilo={estilo} bajada={bajada} />
      <InstanciasPlanta lista={flores} geometria={GEOMETRIA_FLOR} fragmentShader={fragmentFlor} estilo={estilo} bajada={bajada} />
    </>
  );
}

function PlantasPozo({ estilo, borde }) {
  const arriba = useMemo(() => generarJardin(estilo, borde), [estilo, borde]);
  const relleno = useMemo(() => generarJardin(estilo, 0, true), [estilo]);
  return (
    <>
      <BloqueJardin datos={arriba} estilo={estilo} bajada={0} />
      {Array.from({ length: COPIAS_JARDIN }, (_, i) => (
        <BloqueJardin key={i} datos={relleno} estilo={estilo} bajada={(i + 1) * ALTO_BLOQUE_JARDIN} />
      ))}
    </>
  );
}

// `borde`: alto de la franja de arriba de la pared exterior que ocupa el chaflán del cartel (cascada).
function Pozo({ estilo, borde = 0 }) {
  const paredes = useParedesMesa();
  // Todo el pozo (paredes, luces, plantas) se ve también desde la capa de la
  // refracción: la cascada lo dibuja aparte para verlo deformado a través del agua.
  const grupo = useRef(null);
  useLayoutEffect(() => {
    grupo.current?.traverse((objeto) => objeto.layers.enable(CAPA_POZO));
  }, [estilo]);
  const geometria = useMemo(geometriaParedes, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertexParedes,
    fragmentShader: fragmentParedes,
    uniforms: {
      ...ONDA,
      uMapa: { value: null },
      uUsarMapa: { value: 0 },
      uAlbedo: { value: new THREE.Color('#0d0f14') },
      uLuz: { value: new THREE.Color() },
      uBrillo: { value: 1 },
      uAmbiente: { value: 0 },
      uR: { value: 0.85 },
      uCada: { value: 1 },
      uEscalaV: { value: TRAMO / 1.2 },
      uTramos: { value: TRAMOS },
      uBombillas: { value: 0 },
      uIsla: { value: new THREE.Vector2(ISLA[0], ISLA[1]) },
      uChaflan: { value: CHAFLAN },
      uChaflanBorde: { value: 0 },
    },
    side: THREE.DoubleSide,
    ...STENCIL_POZO,
  }), []);

  const u = material.uniforms;
  u.uMapa.value = estilo.pared === 'liso' ? null : paredes[estilo.pared];
  u.uUsarMapa.value = estilo.pared === 'liso' ? 0 : 1;
  u.uLuz.value.set(estilo.luz);
  u.uBrillo.value = estilo.brillo;
  u.uAmbiente.value = estilo.ambiente;
  u.uR.value = estilo.r;
  u.uCada.value = estilo.cada ?? 1;
  u.uBombillas.value = estilo.led === 'bombillas' ? 1 : 0;
  u.uChaflanBorde.value = borde;

  // Fondo negro: tapa el cielo detrás del último reflejo, cuando ya no queda luz.
  const fondo = useMemo(() => anilloPlano([POZO[0] + 1, POZO[1] + 1], [ISLA[0] - 1, ISLA[1] - 1], 0.02, 0.02), []);
  const materialFondo = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide, ...STENCIL_POZO }), []);

  // Las bombillas cercanas son esferas; las lejanas (y todos los LEDs chicos), puntos de luz.
  const { malla, puntos, tam } = useMemo(() => {
    if (estilo.led === 'tira') return { malla: posicionesLeds(estilo, 0, TRAMOS, borde), puntos: [], tam: 0 };
    if (estilo.led === 'bombillas') {
      return { malla: posicionesLeds(estilo, 0, 24, borde), puntos: posicionesLeds(estilo, 24, TRAMOS, borde), tam: 0.2 };
    }
    return { malla: [], puntos: posicionesLeds(estilo, 0, TRAMOS, borde), tam: 0.075 };
  }, [estilo, borde]);

  return (
    <group ref={grupo} position={[0, MESA_Y, 0]}>
      <mesh geometry={geometria} material={material} renderOrder={-1} frustumCulled={false} raycast={() => null} />
      <mesh geometry={fondo} material={materialFondo} position={[0, -TRAMOS * TRAMO + 0.01, 0]} renderOrder={-1} raycast={() => null} />
      <LedsMalla estilo={estilo} instancias={malla} />
      <LedsPuntos estilo={estilo} instancias={puntos} tam={tam} />
      {estilo.plantas && <PlantasPozo estilo={estilo} borde={borde} />}
    </group>
  );
}

// Luces que escapan por el vidrio. Durante la onda de captura toman sus colores.
function ResplandorPozo({ config, posiciones }) {
  const luces = useRef([]);
  const base = useMemo(() => new THREE.Color(config.luz), [config]);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const t = ONDA.uTiempo.value - ONDA.uInicioOnda.value;
    const activa = t >= 0 && t <= DURACION_ONDA;
    const fuerzaCaptura = activa ? Math.sin(Math.min(1, t / 0.5) * Math.PI * 0.5) * (1 - Math.max(0, t - 4.8) / (DURACION_ONDA - 4.8)) : 0;
    // En el festejo las luces giran por el degradé; una captura reciente manda.
    const fiesta = ONDA.uFiesta.value * 0.8 * (1 - fuerzaCaptura);
    const fuerza = Math.max(fuerzaCaptura, fiesta);
    luces.current.forEach((luz, i) => {
      if (!luz) return;
      paletaOnda(fuerzaCaptura >= fiesta ? i * 0.5 - t * 1.8 : i * 0.5 - ONDA.uTiempo.value * 0.9, color);
      luz.color.copy(base).lerp(color, fuerza);
      luz.intensity = config.brillo * 4 * (1 + fuerza * 2.5);
    });
  });

  return posiciones.map(([x, z], i) => (
    <pointLight
      key={`${x}-${z}`}
      ref={(luz) => { luces.current[i] = luz; }}
      position={[x, MESA_Y + 0.3, z]}
      color={config.luz}
      intensity={config.brillo * 4}
      distance={7}
      decay={2}
    />
  ));
}

// Reloj de la onda (tiempo real, independiente de la cámara lenta).
// También lleva el festejo: entra y sale suave al terminar o empezar una partida.
function RelojOnda({ fiesta }) {
  useFrame(({ clock }, delta) => {
    ONDA.uTiempo.value = clock.elapsedTime;
    const objetivo = fiesta ? 1 : 0;
    ONDA.uFiesta.value += (objetivo - ONDA.uFiesta.value) * Math.min(1, delta * 1.2);
  });
  return null;
}

function Mesa({ estilo = 'hielo', tablero = 'oscuro', cascada = false, calidad = 'alta', fiesta = false }) {
  const { mesa, materiales } = useRecursosTablero();
  const config = ESTILOS_MESA[estilo];
  const conEspejo = Boolean(config);
  // Con la cascada el lago llega al borde del pozo y se vuelca adentro: no hay
  // cuerpo ni vidrio, y el estilo elegido (LEDs, ladrillo, plantas) queda detrás del agua.
  const conAgua = cascada && conEspejo;
  const oscuro = tablero !== 'clasico';

  const geometrias = useMemo(() => {
    const [ox, oz] = POZO;
    // El hueco del cuerpo queda apenas por fuera del pozo: si su cara interior
    // coincidiera con la pared del túnel, la taparía (la "franja negra" de arriba).
    const cuerpo = new THREE.ExtrudeGeometry(anillo([ox + BORDE, oz + BORDE], [ox + 0.04, oz + 0.04], 0.18, 0.04), {
      depth: ALTO_CUERPO,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
      curveSegments: 12,
    });
    cuerpo.rotateX(Math.PI / 2);
    cuerpo.translate(0, 0.015, 0);
    return {
      cuerpo,
      // El vidrio (y la máscara del pozo) llega hasta el quiebre del chaflán: apoya en
      // la piedra sin escalón, y por encima del chaflán también se ve el pozo.
      vidrio: anilloPlano(POZO, ISLA_SUPERIOR, 0.04, 0.04),
      // Con la cascada el agua termina en la arista de arriba del chaflán del cartel:
      // la máscara llega hasta ahí, porque mirando bajo se ve el pozo por encima del
      // chaflán (sin esto esa franja quedaba vacía).
      mascaraCascada: anilloPlano(HUECO_CASCADA, ISLA_SUPERIOR, 0.04, 0.04),
      perfilExterior: anilloPlano([ox + 0.06, oz + 0.06], [ox - 0.07, oz - 0.07], 0.04, 0.03),
      // Banda de luz del borde de la isla, con un margen corto para el resplandor.
      bordeIsla: anilloPlano(ISLA_SUPERIOR, [ISLA_SUPERIOR[0] - 0.3, ISLA_SUPERIOR[1] - 0.3], 0.04, 0.02),
      islaChaflan: geometriaIslaChaflan(ISLA[0], ISLA[1], CHAFLAN),
    };
  }, []);

  const materialCuerpo = useMemo(() => {
    // Grafito metálico satinado: se lee como marco sólido. El vidrio negro reflejaba
    // el cielo oscuro y parecía una franja del espejo sin LEDs.
    if (oscuro) return MATERIAL_MARCO_MESA;
    const madera = materiales.bandeja.map.clone();
    madera.wrapS = THREE.RepeatWrapping;
    madera.wrapT = THREE.RepeatWrapping;
    madera.repeat.set(0.2, 0.2);
    madera.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({ map: madera, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.8 });
  }, [oscuro, materiales]);

  const materialVidrio = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: config?.vidrio ?? '#0a0a0a',
    transparent: true,
    opacity: 0.22,
    roughness: 0.03,
    metalness: 0,
    specularIntensity: 0.18,
    // Reflejo tenue: con más intensidad las luces de estudio (invisibles) se ven como paneles fantasma.
    envMapIntensity: 0.22,
    depthWrite: false,
  }), [config]);

  const mascara = useMemo(() => new THREE.MeshBasicMaterial(STENCIL_MASCARA), []);
  const metal = oscuro ? ACERO_MESA : LATON_MESA;
  const isla = conEspejo ? ISLA : [POZO[0], POZO[1]];
  const luzX = (ISLA[0] + POZO[0]) / 2;
  const luzZ = (ISLA[1] + POZO[1]) / 2;

  return (
    <group>
      <RelojOnda fiesta={fiesta} />
      {/* Isla central de piedra donde apoyan tablero y bandejas; con pozo, con los cantos achaflanados. */}
      <mesh
        key={conEspejo ? 'chaflan' : 'plano'}
        geometry={conEspejo ? geometrias.islaChaflan.superior : undefined}
        rotation={conEspejo ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}
        position={[0, MESA_Y, 0]}
        receiveShadow
        raycast={() => null}
      >
        {!conEspejo && <planeGeometry args={[isla[0] * 2, isla[1] * 2]} />}
        <meshPhysicalMaterial
          color="#161618"
          map={mesa.mesa_color}
          roughnessMap={mesa.mesa_orm}
          normalMap={mesa.mesa_normal}
          normalScale={[0.85, 0.85]}
          roughness={0.7}
          sheen={0.3}
          sheenRoughness={0.6}
          sheenColor="#202020"
          clearcoat={0}
          envMapIntensity={0.06}
        />
      </mesh>

      {!conAgua && (
        <>
          <mesh geometry={geometrias.cuerpo} material={materialCuerpo} position={[0, MESA_Y, 0]} castShadow receiveShadow raycast={() => null} layers-mask={MASCARA_REFLEJO} />
          {/* Base de la mesa: tapa el hueco del cuerpo visto desde abajo (en el reflejo del lago). */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, MESA_Y - 1.14, 0]} material={materialCuerpo} raycast={() => null} layers-mask={MASCARA_REFLEJO}>
            <planeGeometry args={[(POZO[0] + BORDE) * 2, (POZO[1] + BORDE) * 2]} />
          </mesh>
        </>
      )}

      {conEspejo && (
        <>
          <mesh geometry={conAgua ? geometrias.mascaraCascada : geometrias.vidrio} material={mascara} position={[0, MESA_Y + 0.001, 0]} renderOrder={-2} raycast={() => null} />
          <Pozo estilo={config} borde={conAgua ? CHAFLAN_BORDE + (MESA_Y - NIVEL_CASCADA) : 0} />
          {conAgua && (
            <CascadaFluida
              pozo={POZO}
              isla={ISLA}
              // El agua cae por la pared desde la arista de abajo del chaflán del cartel.
              nivel={NIVEL_CASCADA - CHAFLAN_BORDE}
              mesaY={MESA_Y}
              tramo={TRAMO}
              estilo={config}
              calidad={calidad}
              onda={ONDA}
              ondaGLSL={ondaGLSL}
              stencil={STENCIL_POZO}
            />
          )}
          {/* Con la cascada, el filo del pozo es un chaflán de vidrio negro con el cartel de anuncios. */}
          {conAgua && <CartelAnuncios pozo={POZO} nivel={NIVEL_CASCADA} material={VIDRIO_NEGRO_MESA} />}
          {!conAgua && (
            <>
              <mesh geometry={geometrias.vidrio} material={materialVidrio} position={[0, MESA_Y + 0.004, 0]} renderOrder={5} raycast={() => null} />
              <mesh geometry={geometrias.perfilExterior} material={metal} position={[0, MESA_Y + 0.006, 0]} raycast={() => null} />
            </>
          )}
          {oscuro && <mesh geometry={geometrias.bordeIsla} material={MATERIAL_BORDE_ISLA} position={[0, MESA_Y + 0.0015, 0]} renderOrder={6} raycast={() => null} />}
          <mesh geometry={geometrias.islaChaflan.chaflan} material={VIDRIO_NEGRO_MESA} position={[0, MESA_Y, 0]} receiveShadow raycast={() => null} />
          <PantallaChaflan ix={ISLA[0]} iz={ISLA[1]} chaflan={CHAFLAN} mesaY={MESA_Y} tira={oscuro} />

          {/* El resplandor del pozo escapa por el vidrio y tiñe el entorno. */}
          <ResplandorPozo config={config} posiciones={[[luzX, 0], [-luzX, 0], [0, luzZ], [0, -luzZ]]} />
        </>
      )}
    </group>
  );
}

export default memo(Mesa);
