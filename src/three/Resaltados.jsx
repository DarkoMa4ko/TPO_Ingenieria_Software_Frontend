import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { casillaOffset } from '../utils/fen.js';
import { PANTALLA_GLSL } from './CasillasLuz.jsx';

// Superposiciones de casilla dibujadas con un único shader de campos de distancia.
export const TIPOS = { seleccion: 0, destino: 1, captura: 2, jaque: 4, hover: 5 };

// Paleta cálida (latón) para el tablero clásico y fría (plata/hielo) para el
// tablero de obsidiana, donde los tonos ámbar se ven marrones.
const PALETAS = {
  clasico: {
    seleccion: '#f1c983',
    destino: '#ffe7b8',
    captura: '#ff7a52',
    jaque: '#ff3b2f',
    hover: '#fff4e0',
  },
  // Sobre casillas de luz blanca los resaltados van en celeste para distinguirse;
  // el rojo queda para las capturas.
  luz: {
    seleccion: '#4fb8ff',
    destino: '#7fcbff',
    captura: '#ff3b2f',
    jaque: '#ff2a1f',
    hover: '#a8dcff',
  },
  oscuro: {
    seleccion: '#d8ecff',
    destino: '#eaf5ff',
    captura: '#ff6a4d',
    jaque: '#ff3b2f',
    hover: '#f2f7ff',
  },
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vMundo;
  void main() {
    vUv = uv - 0.5;
    vMundo = (modelMatrix * vec4(position, 1.0)).xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform int uTipo;
  uniform vec3 uColor;
  uniform float uTiempo;
  uniform float uAparicion;
  uniform float uPantalla;
  varying vec2 vUv;
  varying vec2 vMundo;
  ${PANTALLA_GLSL}

  float caja(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = vUv;
    float r = length(p);
    float luz = 0.0;     // aporte brillante
    float sombra = 0.0;  // halo oscuro que da contraste sobre el arce claro
    float pulso = 0.5 + 0.5 * sin(uTiempo * 3.4);

    if (uTipo == 0) {
      float d = caja(p, vec2(0.45), 0.08);
      float borde = smoothstep(0.03, 0.0, abs(d + 0.01));
      float halo = exp(-max(d, 0.0) * 22.0) * step(0.0, d) * 0.5;
      float relleno = step(d, 0.0) * (0.16 + 0.08 * pulso);
      luz = borde + halo + relleno;
      sombra = smoothstep(0.06, 0.0, abs(d + 0.045)) * 0.35;
    } else if (uTipo == 1) {
      luz = smoothstep(0.155, 0.135, r) * 1.2 + exp(-r * 7.0) * (0.3 + 0.2 * pulso);
      sombra = smoothstep(0.24, 0.13, r) * 0.6;
    } else if (uTipo == 2) {
      // Mira de captura: tres arcos que giran, un destello que los recorre,
      // una corona de marcas girando al revés y esquinas que respiran.
      float ang = atan(p.y, p.x);
      float giro = uTiempo * 0.9 - pow(1.0 - uAparicion, 3.0) * 2.5;
      float c = caja(p, vec2(0.46 - 0.012 * pulso), 0.05);
      vec2 q = abs(p);
      float esquinas = smoothstep(0.035, 0.0, abs(c + 0.015)) * step(0.3, min(q.x, q.y));

      float s = sin(3.0 * (ang - giro)) + 0.6;
      float arcos = clamp(s / max(fwidth(s), 1e-4) + 0.5, 0.0, 1.0);
      float aro = smoothstep(0.026, 0.0, abs(r - 0.43));
      float detras = fract((giro * 2.4 - ang) / 6.2832);
      float destello = exp(-detras * 5.0);

      // Aro interior del mismo estilo, girando al revés.
      float giroInterior = -giro * 1.3;
      float si = sin(3.0 * (ang - giroInterior) + 1.05) + 0.6;
      float arcosInterior = clamp(si / max(fwidth(si), 1e-4) + 0.5, 0.0, 1.0);
      float aroInterior = smoothstep(0.02, 0.0, abs(r - 0.355));
      float detrasInterior = fract((ang - giroInterior * 2.4) / 6.2832);
      float destelloInterior = exp(-detrasInterior * 5.0);

      luz = esquinas * 1.2 + aro * arcos * (0.4 + 1.0 * destello)
        + aroInterior * arcosInterior * (0.25 + 0.7 * destelloInterior) + exp(-abs(c) * 18.0) * 0.18;
      sombra = (smoothstep(0.06, 0.0, abs(c + 0.04)) * step(0.3, min(q.x, q.y)) + smoothstep(0.06, 0.0, abs(r - 0.4)) * arcos * 0.6) * 0.4;
    } else if (uTipo == 4) {
      // Radial puro: llega a cero antes del borde del quad (sin cortes rectos).
      float halo = exp(-r * 3.4) * (0.6 + 0.4 * pulso) * smoothstep(0.5, 0.3, r);
      float onda = fract(uTiempo * 0.9);
      float anillo = smoothstep(0.035, 0.0, abs(r - (0.28 + 0.2 * onda))) * (1.0 - onda);
      luz = halo + anillo * 0.8;
      // Se queda sobre el tablero y su marco.
      luz *= smoothstep(4.85, 4.6, max(abs(vMundo.x), abs(vMundo.y)));
    } else {
      float d = caja(p, vec2(0.45), 0.08);
      luz = smoothstep(0.02, 0.0, abs(d + 0.01)) * 0.6 + step(d, 0.0) * 0.07;
      sombra = smoothstep(0.05, 0.0, abs(d + 0.035)) * 0.2;
    }

    // En el tablero de luz los resaltados los dibuja la misma pantalla: sin
    // sombras y con sus píxeles y su banda de refresco.
    vec3 pantalla = vec3(1.0);
    if (uPantalla > 0.5) {
      sombra = 0.0;
      pantalla = mascaraPantalla(vMundo) * barridoPantalla(vMundo, uTiempo);
    }

    float a = clamp(luz + sombra, 0.0, 1.0) * uAparicion;
    vec3 color = uColor * pantalla * (luz / max(luz + sombra, 1e-4));
    gl_FragColor = vec4(color, a);
  }
`;

const GEOMETRIA = new THREE.PlaneGeometry(1, 1);
GEOMETRIA.rotateX(-Math.PI / 2);
const GEOMETRIA_JAQUE = new THREE.PlaneGeometry(2.2, 2.2);
GEOMETRIA_JAQUE.rotateX(-Math.PI / 2);

function Resaltado({ casilla, tipo, paleta }) {
  const ref = useRef(null);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTipo: { value: TIPOS[tipo] },
      uColor: { value: new THREE.Color(PALETAS[paleta][tipo]).multiplyScalar(tipo === 'jaque' ? 2.2 : 1.7) },
      uTiempo: { value: 0 },
      uAparicion: { value: 0 },
      uPantalla: { value: paleta === 'luz' ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [tipo, paleta]);

  useFrame(({ clock }, delta) => {
    const u = material.uniforms;
    u.uTiempo.value = clock.elapsedTime;
    u.uAparicion.value = Math.min(1, u.uAparicion.value + delta * 6);
    if (ref.current && (tipo === 'destino' || tipo === 'captura')) {
      const k = u.uAparicion.value;
      ref.current.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - k, 3)));
    }
  });

  const { x, z } = casillaOffset(casilla);
  // El halo de jaque puede llegar al marco (2 cm más alto que las casillas): va por encima.
  const y = { hover: 0.004, seleccion: 0.005, jaque: 0.032 }[tipo] ?? 0.007;
  return (
    <mesh
      ref={ref}
      geometry={tipo === 'jaque' ? GEOMETRIA_JAQUE : GEOMETRIA}
      material={material}
      position={[x, y, z]}
      renderOrder={2}
      raycast={() => null}
    />
  );
}

export default function Resaltados({ seleccion, destinos, capturas, jaque, hover, estilo = 'oscuro' }) {
  const paleta = PALETAS[estilo] ? estilo : 'oscuro';
  return (
    <group>
      {hover && hover !== seleccion && <Resaltado key={`h-${hover}`} casilla={hover} tipo="hover" paleta={paleta} />}
      {seleccion && <Resaltado key={`s-${seleccion}`} casilla={seleccion} tipo="seleccion" paleta={paleta} />}
      {jaque && <Resaltado key={`j-${jaque}`} casilla={jaque} tipo="jaque" paleta={paleta} />}
      {destinos.map((casilla) => (
        <Resaltado
          key={`d-${seleccion}-${casilla}`}
          casilla={casilla}
          tipo={capturas.has(casilla) ? 'captura' : 'destino'}
          paleta={paleta}
        />
      ))}
    </group>
  );
}
