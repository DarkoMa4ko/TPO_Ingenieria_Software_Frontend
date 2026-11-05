import * as THREE from 'three';

// Efecto holograma: aristas cian con líneas de escaneo, parpadeo y "glitch"
// (bandas que se desplazan), y planos de recorte que revelan los materiales
// sólidos detrás de un barrido. Se usa al empezar la partida y al capturar.

export const RELOJ_HOLO = { uTiempo: { value: 0 } };

const LEJOS = 1e5;

// Planos compartidos por la intro. Con la constante "lejos" no recortan nada,
// así los materiales compilan una sola vez con el recorte ya activo.
export const PLANOS_INTRO = {
  solido: new THREE.Plane(new THREE.Vector3(0, 0, 1), LEJOS),
  holoFrente: new THREE.Plane(new THREE.Vector3(0, 0, 1), LEJOS),
  holoCola: new THREE.Plane(new THREE.Vector3(0, 0, -1), LEJOS),
};
export const RECORTE_SOLIDO = [PLANOS_INTRO.solido];

// Plano que nunca recorta: completa a dos planos los materiales holográficos
// sueltos para que compartan el programa ya compilado de la intro.
export const PLANO_NEUTRO = new THREE.Plane(new THREE.Vector3(0, 1, 0), LEJOS);

const vertexHolo = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  uniform float uTiempo;
  uniform float uGlitch;
  varying vec3 vMundo;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec4 mundo = modelMatrix * vec4(position, 1.0);
    // Glitch: algunas franjas horizontales saltan de costado por un instante.
    float franja = floor(mundo.y * 9.0);
    float pulso = floor(uTiempo * 14.0);
    float r = hash(franja * 13.1 + pulso * 7.7);
    mundo.x += (r > 0.9 ? (hash(franja + pulso) - 0.5) * 0.35 : 0.0) * uGlitch;
    vMundo = mundo.xyz;
    vec4 mvPosition = viewMatrix * mundo;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const fragmentHolo = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform float uTiempo;
  uniform vec3 uColor;
  uniform float uIntensidad;
  uniform float uOpacidad;
  varying vec3 vMundo;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    #include <clipping_planes_fragment>
    float lineas = 0.65 + 0.35 * sin(vMundo.y * 90.0 - uTiempo * 9.0);
    float parpadeo = 0.82 + 0.18 * hash(floor(uTiempo * 24.0));
    float barrido = smoothstep(0.0, 0.4, fract(vMundo.y * 0.6 - uTiempo * 0.9)) * 0.5 + 0.5;
    float a = uOpacidad * lineas * parpadeo * barrido;
    gl_FragColor = vec4(uColor * uIntensidad * a, a);
  }
`;

export function crearMaterialHolo({ color = '#5fe3ff', intensidad = 2.4, planos = null } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vertexHolo,
    fragmentShader: fragmentHolo,
    uniforms: {
      ...RELOJ_HOLO,
      uColor: { value: new THREE.Color(color) },
      uIntensidad: { value: intensidad },
      uOpacidad: { value: 1 },
      uGlitch: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    clipping: true,
    clippingPlanes: planos,
  });
}

// Material de las aristas durante la intro: sólo visible entre los dos frentes.
export const MATERIAL_HOLO_INTRO = crearMaterialHolo({ planos: [PLANOS_INTRO.holoFrente, PLANOS_INTRO.holoCola] });
MATERIAL_HOLO_INTRO.visible = false;

// Aplica el plano de recorte de la intro a un material sólido.
export function conRecorteIntro(material) {
  material.clippingPlanes = RECORTE_SOLIDO;
  material.clipShadows = true;
  return material;
}

const cacheAristas = new WeakMap();
// Aristas "de diseño" (pliegues de más de `angulo` grados): mucho más livianas
// que un wireframe completo y se leen como un plano técnico.
export function aristasDe(geometria, angulo = 14) {
  if (!geometria) return null;
  let aristas = cacheAristas.get(geometria);
  if (!aristas) {
    aristas = new THREE.EdgesGeometry(geometria, angulo);
    cacheAristas.set(geometria, aristas);
  }
  return aristas;
}

// --- Barrido de la intro -----------------------------------------------------
// Avanza desde el lado de las blancas (z = +ORIGEN) hacia las negras: primero
// llegan las aristas holográficas y, unas unidades detrás, el material sólido.
// Al volver al inicio corre al revés y el tablero se desarma: en el inicio no hay
// tablero, se genera recién con el holograma de cada partida.
const ORIGEN = 7.5;
const RECORRIDO = 17;
const SEPARACION = 3.5;
const DURACION = 2.1;
// inicio: comienzo de la última materialización (PantallaChaflan lo usa para su logo).
export const INTRO = { inicio: -100, inicioSalida: -100, activa: false, reversa: false };

export function iniciarIntroHolograma(tiempo) {
  INTRO.inicio = tiempo;
  INTRO.activa = true;
  INTRO.reversa = false;
  aplicarIntro(tiempo);
}

export function iniciarSalidaHolograma(tiempo) {
  INTRO.inicioSalida = tiempo;
  INTRO.activa = true;
  INTRO.reversa = true;
  aplicarIntro(tiempo);
}

// Sin tablero ni piezas: el plano sólido lo recorta todo.
export function ocultarIntro() {
  INTRO.activa = false;
  PLANOS_INTRO.solido.normal.set(0, 0, 1);
  PLANOS_INTRO.solido.constant = -LEJOS;
  PLANOS_INTRO.holoFrente.constant = LEJOS;
  PLANOS_INTRO.holoCola.constant = LEJOS;
  MATERIAL_HOLO_INTRO.visible = false;
}

export function aplicarIntro(tiempo) {
  if (!INTRO.activa) return null;
  const t = (tiempo - (INTRO.reversa ? INTRO.inicioSalida : INTRO.inicio)) / DURACION;
  if (t >= 1.25) {
    if (INTRO.reversa) {
      ocultarIntro();
      return null;
    }
    INTRO.activa = false;
    PLANOS_INTRO.solido.constant = LEJOS;
    PLANOS_INTRO.holoFrente.constant = LEJOS;
    PLANOS_INTRO.holoCola.constant = LEJOS;
    MATERIAL_HOLO_INTRO.visible = false;
    return null;
  }
  const k = INTRO.reversa ? 1.25 - t : t;
  const avance = Math.max(0, k) * (RECORRIDO + SEPARACION);
  const frente = avance;
  const cola = avance - SEPARACION;
  // Visible si z > ORIGEN - d  <=>  normal (0,0,1), constante -(ORIGEN - d)... desde las blancas
  // hacia las negras la distancia recorrida es d = ORIGEN - z.
  PLANOS_INTRO.solido.normal.set(0, 0, 1);
  PLANOS_INTRO.solido.constant = -(ORIGEN - cola);
  PLANOS_INTRO.holoFrente.normal.set(0, 0, 1);
  PLANOS_INTRO.holoFrente.constant = -(ORIGEN - frente);
  PLANOS_INTRO.holoCola.normal.set(0, 0, -1);
  PLANOS_INTRO.holoCola.constant = ORIGEN - cola;
  MATERIAL_HOLO_INTRO.visible = true;
  return { frenteZ: ORIGEN - frente, colaZ: ORIGEN - cola, k };
}
