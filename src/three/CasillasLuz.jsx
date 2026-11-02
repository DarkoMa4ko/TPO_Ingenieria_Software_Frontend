import * as THREE from 'three';
import { RECORTE_SOLIDO } from './holograma.js';
import { ONDA } from './onda.js';

// Tablero "Luz y vidrio": el tablero es una pantalla bajo el vidrio negro. Las
// casillas claras son píxeles encendidos en blanco y las oscuras, la pantalla
// apagada (el vidrio de la base).
//
// El pulso rojo de captura se eliminó: las casillas de la pantalla ya no
// cambian de color con la onda, y para los otros tableros esta capa no dibuja.

// Lo que hace que se lea como pantalla, compartido con los resaltados (que la
// pantalla dibuja, sin sombras): subpíxeles RGB que se ven de cerca y una banda
// de refresco tenue que recorre el tablero.
export const PANTALLA_GLSL = /* glsl */ `
  // 320 píxeles por lado del tablero; cada uno con tres franjas R, G y B.
  vec3 mascaraPantalla(vec2 xz) {
    vec2 p = xz / 0.025;
    vec2 w = fwidth(p);
    // De lejos los subpíxeles son más chicos que un píxel real: se apagan antes
    // de producir moiré y queda el color parejo.
    float nitidez = 1.0 - smoothstep(0.12, 0.3, max(w.x, w.y));
    float sub = fract(p.x) * 3.0;
    vec3 franjas = clamp(1.0 - abs(vec3(sub) - vec3(0.5, 1.5, 2.5)) * 1.6, 0.0, 1.0);
    float fila = smoothstep(0.0, 0.12, fract(p.y)) * smoothstep(1.0, 0.88, fract(p.y));
    // 5.4 compensa lo que tapan las franjas y la rejilla: el brillo medio no cambia.
    return mix(vec3(1.0), franjas * fila * 5.4, nitidez);
  }
  float barridoPantalla(vec2 xz, float t) {
    float fase = fract((xz.y + 4.0) / 16.0 - t * 0.09);
    return 1.0 + 0.06 * smoothstep(0.0, 0.05, fase) * smoothstep(0.1, 0.05, fase);
  }
`;

const vertex = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  varying vec2 vXZ;
  void main() {
    vec4 mundo = modelMatrix * vec4(position, 1.0);
    vXZ = mundo.xz;
    vec4 mvPosition = viewMatrix * mundo;
    #include <clipping_planes_vertex>
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragment = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform float uTiempo;
  uniform float uInicioOnda;
  uniform vec2 uOrigenOnda;
  uniform vec3 uBlanco;
  uniform vec3 uRojo;
  varying vec2 vXZ;
  ${PANTALLA_GLSL}

  void main() {
    #include <clipping_planes_fragment>
    // Casilla: columna desde a (x = -4) y fila desde la 1 (z = 4). a1 es oscura.
    vec2 celda = vec2(floor(vXZ.x + 4.0), floor(4.0 - vXZ.y));
    if (mod(celda.x + celda.y, 2.0) < 0.5) discard;

    // Borde nítido, con el antialias de un píxel.
    vec2 q = fract(vXZ + 4.0) - 0.5;
    float borde = 0.5 - max(abs(q.x), abs(q.y));
    float casilla = smoothstep(0.0, fwidth(borde) * 1.5, borde);

    // El pulso rojo por captura o mate se eliminó: las casillas mantienen
    // su color durante todo el juego, sin parpadeos.
    float rojo = 0.0;

    #ifdef PANTALLA
      vec3 color = mix(uBlanco, uRojo, rojo) * mascaraPantalla(vXZ) * barridoPantalla(vXZ, uTiempo);
      // Un poco del reflejo del vidrio de arriba se ve a través de la imagen.
      gl_FragColor = vec4(color, 0.93 * casilla);
    #else
      if (rojo < 0.002) discard;
      gl_FragColor = vec4(uRojo, 0.85 * rojo * casilla);
    #endif
  }
`;

const crearMaterial = (pantalla) => new THREE.ShaderMaterial({
  vertexShader: vertex,
  fragmentShader: fragment,
  defines: pantalla ? { PANTALLA: '' } : {},
  uniforms: {
    ...ONDA,
    // Blanco apenas frío, un poco sobre el umbral del bloom: un halo corto lo
    // hace leer como luz sin velar el tablero.
    uBlanco: { value: new THREE.Color('#eef4ff').multiplyScalar(1.6) },
    // AgX mezcla un poco del rojo en verde y azul y lo lleva al salmón; un verde y
    // azul levemente negativos (el buffer es HDR) lo compensan y sale rojo de verdad.
    uRojo: { value: new THREE.Color().setRGB(1.05, -0.13, -0.09) },
  },
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  toneMapped: false,
  clipping: true,
  clippingPlanes: RECORTE_SOLIDO,
});

const MATERIAL_PANTALLA = crearMaterial(true);
// Para los estilos no-luz la capa ya no dibuja nada (el shader descarta siempre).
const MATERIAL_PULSO = crearMaterial(false);

const GEOMETRIA = new THREE.PlaneGeometry(8, 8);
GEOMETRIA.rotateX(-Math.PI / 2);

// `pantalla`: el tablero de luz completo; si no, un material sin visibilidad
// (el pulso rojo se eliminó y para los estilos no-luz la capa no dibuja nada).
export default function CasillasLuz({ pantalla = true }) {
  return (
    <mesh
      geometry={GEOMETRIA}
      material={pantalla ? MATERIAL_PANTALLA : MATERIAL_PULSO}
      position={[0, 0.0015, 0]}
      renderOrder={1}
      raycast={() => null}
    />
  );
}
