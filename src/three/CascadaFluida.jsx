import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Cascada interna: el lago se vuelca por el borde del pozo y cae por las paredes.
//
// Es un muro de agua artificial, como los de un hotel: una película pareja y
// tranquila que baja pegada a la pared y apenas deforma las luces de atrás.
//
// Simulación: decenas de miles de partículas de agua viven en la GPU (posición y
// velocidad en texturas que se actualizan cada cuadro). Salen del borde con el
// agua del lago y bajan pegadas a la pared: el roce con la pared limita la
// velocidad (no acelera como una cascada libre), una fuerza de adhesión las
// mantiene a la distancia de la película y una presión lateral reparte el agua
// pareja (cada cuadro se acumula la densidad sobre la pared en una grilla y el
// agua se va de donde hay más hacia donde hay menos). Pulsos suaves en el caudal
// del borde forman las ondas que bajan por la película.
//
// Render: las partículas se funden en una superficie continua con la técnica de
// fluidos en espacio de pantalla. Se dibuja la profundidad de cada partícula como
// una esfera estirada en la dirección en que cae, se suaviza con un filtro que
// respeta los bordes, se reconstruyen las normales y se sombrea como agua:
// Fresnel, reflejo del entorno y de los LEDs de enfrente, transparencia según el
// espesor y la luz del estilo que la atraviesa.

// Velocidad pareja de la película y su distancia a la pared (delante de los LEDs).
const VELOCIDAD_PELICULA = 1.35;
const SEPARACION_PELICULA = 0.07;
const CAIDA_MAXIMA = 8;
const VIDA = CAIDA_MAXIMA / VELOCIDAD_PELICULA + 0.5;
const ANCHO_DENSIDAD = 1024;
// Capa con el pozo solo (sin isla, tablero ni agua) para la refracción.
export const CAPA_POZO = 6;
const ALTO_DENSIDAD = 128;

// Ruido simplex 3D de Ashima Arts / Stefan Gustavson (licencia MIT).
const simplexGLSL = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

// Uniforms y geometría de las paredes que comparten la simulación y la grilla.
const comunGLSL = /* glsl */ `
  uniform float uDt;
  uniform float uTiempo;
  uniform float uSemilla;
  uniform float uNivel;
  uniform vec2 uPozo;
  uniform float uPerimetro;
  uniform float uEmisores;
  uniform float uPorEmisor;
  uniform float uVida;
  uniform float uCaidaMax;
  uniform sampler2D tDensidad;
  uniform vec2 uTexelDensidad;

  uint pcg(uint v) {
    uint estado = v * 747796405u + 2891336453u;
    uint palabra = ((estado >> ((estado >> 28u) + 4u)) ^ estado) * 277803737u;
    return (palabra >> 22u) ^ palabra;
  }
  float azar(float indice, float canal) {
    return float(pcg(uint(indice) * 4u + uint(canal) + uint(uSemilla) * 2654435761u)) / 4294967295.0;
  }

  // Punto del borde del pozo a una distancia u del recorrido (mismo orden que
  // segmentosPared en Mesa.jsx), con la normal hacia el hueco y la tangente.
  void labio(float u, out vec3 p, out vec3 hacia, out vec3 tangente) {
    float ox = uPozo.x;
    float oz = uPozo.y;
    if (u < 2.0 * ox) {
      p = vec3(-ox + u, uNivel, oz); hacia = vec3(0.0, 0.0, -1.0); tangente = vec3(1.0, 0.0, 0.0);
    } else if (u < 2.0 * ox + 2.0 * oz) {
      p = vec3(ox, uNivel, oz - (u - 2.0 * ox)); hacia = vec3(-1.0, 0.0, 0.0); tangente = vec3(0.0, 0.0, -1.0);
    } else if (u < 4.0 * ox + 2.0 * oz) {
      p = vec3(ox - (u - 2.0 * ox - 2.0 * oz), uNivel, -oz); hacia = vec3(0.0, 0.0, 1.0); tangente = vec3(-1.0, 0.0, 0.0);
    } else {
      p = vec3(-ox, uNivel, -oz + (u - 4.0 * ox - 2.0 * oz)); hacia = vec3(1.0, 0.0, 0.0); tangente = vec3(0.0, 0.0, 1.0);
    }
  }

  // Para una partícula: distancia u sobre el recorrido, separación de la pared,
  // normal hacia el hueco y tangente de la pared más cercana.
  void muro(vec3 p, out float u, out float separacion, out vec3 hacia, out vec3 tangente) {
    float ox = uPozo.x;
    float oz = uPozo.y;
    float dx = ox - abs(p.x);
    float dz = oz - abs(p.z);
    if (dz <= dx) {
      separacion = dz;
      if (p.z > 0.0) { u = p.x + ox; hacia = vec3(0.0, 0.0, -1.0); tangente = vec3(1.0, 0.0, 0.0); }
      else { u = 2.0 * ox + 2.0 * oz + (ox - p.x); hacia = vec3(0.0, 0.0, 1.0); tangente = vec3(-1.0, 0.0, 0.0); }
    } else {
      separacion = dx;
      if (p.x > 0.0) { u = 2.0 * ox + (oz - p.z); hacia = vec3(-1.0, 0.0, 0.0); tangente = vec3(0.0, 0.0, -1.0); }
      else { u = 4.0 * ox + 2.0 * oz + (p.z + oz); hacia = vec3(1.0, 0.0, 0.0); tangente = vec3(0.0, 0.0, 1.0); }
    }
  }
`;

// Nacimiento compartido por los dos pasos de la simulación: los dos deciden lo
// mismo porque leen la misma edad y usan el mismo azar del cuadro.
const nacimientoGLSL = /* glsl */ `
  float indiceParticula() {
    return floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x);
  }
  float vidaDe(float emisor) {
    return uVida * (0.93 + 0.14 * fract(sin(emisor * 12.9898) * 43758.5453));
  }
`;

const velocidadGLSL = /* glsl */ `
  ${comunGLSL}
  ${simplexGLSL}
  ${nacimientoGLSL}
  vec3 potencial(vec3 p) {
    return vec3(snoise(p), snoise(p + vec3(31.416, -47.853, 12.793)), snoise(p + vec3(-23.17, 9.31, 57.11)));
  }
  // Turbulencia del aire: rotor de un campo de ruido (no crea ni destruye agua).
  vec3 rotor(vec3 p) {
    const float e = 0.12;
    vec3 x0 = potencial(p - vec3(e, 0.0, 0.0));
    vec3 x1 = potencial(p + vec3(e, 0.0, 0.0));
    vec3 y0 = potencial(p - vec3(0.0, e, 0.0));
    vec3 y1 = potencial(p + vec3(0.0, e, 0.0));
    vec3 z0 = potencial(p - vec3(0.0, 0.0, e));
    vec3 z1 = potencial(p + vec3(0.0, 0.0, e));
    return vec3((y1.z - y0.z) - (z1.y - z0.y), (z1.x - z0.x) - (x1.z - x0.z), (x1.y - x0.y) - (y1.x - y0.x)) / (2.0 * e);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);
    float indice = indiceParticula();
    float emisor = floor(indice / uPorEmisor);
    float vida = vidaDe(emisor);
    float edad = pos.w + uDt;
    bool nace = (pos.w < 0.0 && edad >= 0.0) || edad >= vida;

    if (nace) {
      float u = (emisor + 0.5 + (azar(indice, 0.0) - 0.5) * 0.9) / uEmisores * uPerimetro;
      vec3 p0; vec3 hacia; vec3 tangente;
      labio(u, p0, hacia, tangente);
      // El agua pasa el borde apenas despegada y con pulsos suaves de caudal: de
      // ahí salen las ondas que bajan por la película.
      float pulso = 0.12 * sin(uTiempo * 2.4 - u * 0.45) + 0.05 * snoise(vec3(u * 0.3, uTiempo * 0.2, 7.0));
      vec3 v0 = hacia * 0.18
        + tangente * (azar(indice, 2.0) - 0.5) * 0.02
        - vec3(0.0, 0.35 + pulso, 0.0);
      gl_FragColor = vec4(v0, 1.0);
      return;
    }
    if (pos.w < 0.0) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec3 p = pos.xyz;
    vec3 v = vel.xyz;
    float caida = uNivel - p.y;

    float u; float separacion; vec3 hacia; vec3 tangente;
    muro(p, u, separacion, hacia, tangente);

    // El roce con la pared frena la caída: la película baja a velocidad pareja.
    v.y += (-${VELOCIDAD_PELICULA.toFixed(2)} - v.y) * 2.6 * uDt;

    // Adhesión: la película se queda a su distancia de la pared, sin rebotar.
    v += hacia * ((${SEPARACION_PELICULA.toFixed(3)} - separacion) * 16.0 - dot(v, hacia) * 5.0) * uDt;

    // Un leve movimiento del agua, para que la película no sea un vidrio.
    v += rotor(p * vec3(0.7, 0.5, 0.7) + vec3(0.0, uTiempo * 0.4, 0.0)) * 0.12 * uDt;

    // Presión lateral: el agua se reparte pareja a lo largo de la pared y no
    // se desvía de costado.
    vec2 c = vec2(u / uPerimetro, caida / uCaidaMax);
    vec4 d0 = texture2D(tDensidad, c);
    vec4 dI = texture2D(tDensidad, c - vec2(uTexelDensidad.x, 0.0));
    vec4 dD = texture2D(tDensidad, c + vec2(uTexelDensidad.x, 0.0));
    float gradiente = clamp((dD.x - dI.x) / max(d0.x, 0.08), -3.0, 3.0);
    v -= tangente * (gradiente * 0.5 + dot(v, tangente) * 1.2) * uDt;

    // La pared no se atraviesa.
    float haciaAdentro = dot(v, hacia);
    if (separacion < 0.015 && haciaAdentro < 0.0) v -= hacia * haciaAdentro * 1.2;

    // Más allá de la caída visible la partícula se apaga hasta volver a nacer.
    gl_FragColor = vec4(v, vel.w * step(caida, uCaidaMax));
  }
`;

const posicionGLSL = /* glsl */ `
  ${comunGLSL}
  ${nacimientoGLSL}
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv);
    vec4 vel = texture2D(textureVelocity, uv);
    float indice = indiceParticula();
    float emisor = floor(indice / uPorEmisor);
    float vida = vidaDe(emisor);
    float edad = pos.w + uDt;
    bool nace = (pos.w < 0.0 && edad >= 0.0) || edad >= vida;

    if (nace) {
      float u = (emisor + 0.5 + (azar(indice, 0.0) - 0.5) * 0.9) / uEmisores * uPerimetro;
      vec3 p0; vec3 hacia; vec3 tangente;
      labio(u, p0, hacia, tangente);
      p0 += hacia * 0.012 - vec3(0.0, 0.012 * azar(indice, 3.0), 0.0);
      gl_FragColor = vec4(p0, pos.w < 0.0 ? edad : edad - vida);
      return;
    }
    if (pos.w < 0.0) {
      gl_FragColor = vec4(pos.xyz, edad);
      return;
    }
    gl_FragColor = vec4(pos.xyz + vel.xyz * uDt, edad);
  }
`;

// Grilla de densidad sobre la pared: cada partícula suma su peso y su
// separación de la pared (para conocer el plano medio de la lámina).
const vertexDensidad = /* glsl */ `
  ${comunGLSL}
  uniform sampler2D tPos;
  uniform sampler2D tVel;
  attribute vec2 aRef;
  varying float vSeparacion;
  void main() {
    vec4 p = texture2D(tPos, aRef);
    vec4 v = texture2D(tVel, aRef);
    if (p.w < 0.0 || v.w < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    float u; float separacion; vec3 hacia; vec3 tangente;
    muro(p.xyz, u, separacion, hacia, tangente);
    vec2 c = vec2(u / uPerimetro, (uNivel - p.y) / uCaidaMax);
    gl_Position = vec4(c * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 3.0;
    vSeparacion = separacion;
  }
`;

const fragmentDensidad = /* glsl */ `
  varying float vSeparacion;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float w = exp(-dot(d, d) * 9.0);
    gl_FragColor = vec4(w, w * vSeparacion, 0.0, 1.0);
  }
`;

// Cada partícula como una esfera estirada en la dirección en que se mueve en
// pantalla: así el agua que cae rápido se ve en hebras continuas.
const vertexParticula = /* glsl */ `
  uniform sampler2D tPos;
  uniform sampler2D tVel;
  uniform float uNivel;
  uniform float uCaidaMax;
  uniform float uRadio;
  attribute vec2 aRef;
  varying vec2 vEsquina;
  varying float vRadio;
  varying float vProfundidad;
  void main() {
    vec4 p = texture2D(tPos, aRef);
    vec4 v = texture2D(tVel, aRef);
    float caida = uNivel - p.y;
    if (p.w < 0.0 || v.w < 0.5 || caida > uCaidaMax) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec4 mv = viewMatrix * vec4(p.xyz, 1.0);
    vec3 vv = (viewMatrix * vec4(v.xyz, 0.0)).xyz;
    float radio = uRadio;
    float rapidez = length(vv.xy);
    vec2 dir = rapidez > 0.0001 ? vv.xy / rapidez : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float largo = rapidez * 0.018;
    mv.xy += position.x * perp * radio + position.y * dir * (radio + largo);
    vEsquina = position.xy;
    vRadio = radio;
    vProfundidad = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentProfundidad = /* glsl */ `
  varying vec2 vEsquina;
  varying float vRadio;
  varying float vProfundidad;
  void main() {
    float r2 = dot(vEsquina, vEsquina);
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vProfundidad - sqrt(1.0 - r2) * vRadio, 0.0, 0.0, 1.0);
  }
`;

const fragmentGrosor = /* glsl */ `
  varying vec2 vEsquina;
  varying float vRadio;
  void main() {
    float r2 = dot(vEsquina, vEsquina);
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(sqrt(1.0 - r2) * vRadio * 2.0, 0.0, 0.0, 1.0);
  }
`;

const vertexPantalla = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Suavizado de la profundidad que no mezcla agua con agua que está más atrás:
// une las partículas en una superficie sin redondear los bordes de las hebras.
const fragmentSuavizado = /* glsl */ `
  uniform sampler2D tProf;
  uniform vec2 uDir;
  uniform vec2 uTexel;
  uniform float uFocal;
  uniform float uRadioMundo;
  uniform float uRango;
  uniform float uEscalaRadio;
  varying vec2 vUv;
  void main() {
    float z = texture2D(tProf, vUv).r;
    if (z <= 0.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float radio = clamp(uRadioMundo * uEscalaRadio * uFocal / z, 1.0, 12.0);
    float suma = 0.0;
    float peso = 0.0;
    for (int i = -12; i <= 12; i++) {
      float fi = float(i);
      if (abs(fi) > radio) continue;
      float zs = texture2D(tProf, vUv + uDir * uTexel * fi).r;
      if (zs <= 0.0) continue;
      float w = exp(-fi * fi / (0.5 * radio * radio)) * exp(-pow((zs - z) / uRango, 2.0));
      suma += zs * w;
      peso += w;
    }
    gl_FragColor = vec4(suma / max(peso, 0.00001), 0.0, 0.0, 1.0);
  }
`;

function fragmentComposicion(ondaGLSL) {
  return /* glsl */ `
  uniform sampler2D tProf;
  uniform sampler2D tGrosor;
  uniform sampler2D tFondo;
  uniform vec2 uResolucion;
  uniform vec2 uTexelProf;
  uniform mat4 uProy;
  uniform mat4 uProyInv;
  uniform mat4 uCamaraMundo;
  uniform float uActivo;
  uniform vec3 uLuz;
  uniform float uBrillo;
  uniform float uR;
  uniform float uTramo;
  uniform float uNivel;
  uniform float uMesaY;
  uniform float uCaidaMax;
  uniform float uEnvIntensidad;
  uniform float uLedTipo;
  uniform vec3 uLedColor;
  uniform float uLedSep;
  uniform float uCada;
  uniform vec2 uIsla;
  uniform vec2 uPozo;
  uniform sampler2D envMap;
  uniform samplerCube envCubo;
  ${ondaGLSL}
  #include <cube_uv_reflection_fragment>

  // Ondas largas de la película: unas pocas ondas suaves, apenas diagonales, que
  // bajan a la velocidad del agua. Devuelve la inclinación de la superficie en el
  // plano de la pared; con ella lo de atrás se deforma en forma amplia y pareja,
  // como la luna y las estrellas en el lago, no en granitos.
  vec3 inclinacionOndas(vec3 P) {
    float dx = uPozo.x - abs(P.x);
    float dz = uPozo.y - abs(P.z);
    float u = dz <= dx ? P.x : P.z;
    vec3 tangente = dz <= dx ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
    float y = P.y + ${VELOCIDAD_PELICULA.toFixed(2)} * uTiempo;
    const float A1 = 6.2832 / 1.6;
    const float B1 = 6.2832 / 4.5;
    const float A2 = 6.2832 / 0.95;
    const float B2 = -6.2832 / 3.2;
    const float A3 = 6.2832 / 2.7;
    const float B3 = 6.2832 / 7.0;
    float c1 = cos(A1 * y + B1 * u);
    float c2 = cos(A2 * y + B2 * u + 1.7);
    float c3 = cos(A3 * y + B3 * u + 4.1);
    float enY = 0.5 * A1 * c1 + 0.25 * A2 * c2 + 0.6 * A3 * c3;
    float enU = 0.5 * B1 * c1 + 0.25 * B2 * c2 + 0.6 * B3 * c3;
    return (tangente * enU + vec3(0.0, enY, 0.0)) * 0.2;
  }

  vec3 posVista(vec2 uv, float z) {
    vec4 rayo = uProyInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    rayo.xyz /= rayo.w;
    return rayo.xyz * (z / -rayo.z);
  }

  // Reflejo de las hileras de LEDs de la isla que el agua tiene enfrente.
  vec3 reflejoLeds(vec3 P, vec3 R) {
    if (uLedTipo < 0.5) return vec3(0.0);
    float mejor = 1e9;
    vec3 H = vec3(0.0);
    float aLoLargo = 0.0;
    if (abs(R.x) > 0.0001) {
      float t = (sign(P.x) * uIsla.x - P.x) / R.x;
      vec3 q = P + R * t;
      if (t > 0.0 && abs(q.z) <= uIsla.y) { mejor = t; H = q; aLoLargo = q.z + uIsla.y; }
    }
    if (abs(R.z) > 0.0001) {
      float t = (sign(P.z) * uIsla.y - P.z) / R.z;
      vec3 q = P + R * t;
      if (t > 0.0 && t < mejor && abs(q.x) <= uIsla.x) { mejor = t; H = q; aLoLargo = q.x + uIsla.x; }
    }
    if (mejor > 1e8) return vec3(0.0);
    float bajo = uMesaY - H.y;
    float paso = uTramo * uCada;
    float fila = floor((bajo - 0.08) / paso + 0.5);
    if (fila < 0.0) return vec3(0.0);
    float alto = bajo - (0.08 + fila * paso);
    float aten = pow(uR, (0.08 + fila * paso) / uTramo);
    float brillo;
    if (uLedTipo < 1.5) {
      float lado = mod(aLoLargo, uLedSep) - uLedSep * 0.5;
      brillo = exp(-(lado * lado + alto * alto) / 0.0016);
    } else {
      brillo = exp(-alto * alto / 0.0012);
    }
    return uLedColor * brillo * aten;
  }

  void main() {
    if (uActivo < 0.5) discard;
    vec2 uv = gl_FragCoord.xy / uResolucion;
    float z = texture2D(tProf, uv).r;
    if (z <= 0.0) discard;
    vec3 P = posVista(uv, z);

    // Normal a partir de la profundidad suavizada, eligiendo el vecino más
    // parecido para no inventar pendientes en los bordes de las hebras.
    vec2 ex = vec2(uTexelProf.x, 0.0);
    vec2 ey = vec2(0.0, uTexelProf.y);
    float zx1 = texture2D(tProf, uv + ex).r;
    float zx0 = texture2D(tProf, uv - ex).r;
    float zy1 = texture2D(tProf, uv + ey).r;
    float zy0 = texture2D(tProf, uv - ey).r;
    bool okx1 = zx1 > 0.0 && abs(zx1 - z) < 0.25;
    bool okx0 = zx0 > 0.0 && abs(zx0 - z) < 0.25;
    bool oky1 = zy1 > 0.0 && abs(zy1 - z) < 0.25;
    bool oky0 = zy0 > 0.0 && abs(zy0 - z) < 0.25;
    vec3 ddx = okx1 && (!okx0 || abs(zx1 - z) < abs(z - zx0)) ? posVista(uv + ex, zx1) - P : (okx0 ? P - posVista(uv - ex, zx0) : vec3(0.001, 0.0, 0.0));
    vec3 ddy = oky1 && (!oky0 || abs(zy1 - z) < abs(z - zy0)) ? posVista(uv + ey, zy1) - P : (oky0 ? P - posVista(uv - ey, zy0) : vec3(0.0, 0.001, 0.0));
    vec3 N = normalize(cross(ddx, ddy));
    if (dot(N, P) > 0.0) N = -N;
    // En el contorno de la película falta algún vecino y la normal es dudosa: ahí
    // se apagan los reflejos para que no aparezcan puntos brillantes sueltos.
    float confianza = ((okx0 || okx1) ? 0.5 : 0.0) + ((oky0 || oky1) ? 0.5 : 0.0);

    vec4 clip = uProy * vec4(P, 1.0);
    gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);

    vec3 Pw = (uCamaraMundo * vec4(P, 1.0)).xyz;
    vec3 inclinacion = inclinacionOndas(Pw);
    // Las ondas también inclinan la normal: los reflejos se mecen con ellas.
    vec3 Nw = normalize((uCamaraMundo * vec4(N, 0.0)).xyz + inclinacion * 0.25);
    vec3 Vw = normalize(cameraPosition - Pw);
    float caida = uNivel - Pw.y;

    // Espesor: cuánta agua atraviesa la luz en este punto.
    float grosor = texture2D(tGrosor, uv).r;
    float cuerpo = 1.0 - exp(-grosor * 7.0);

    // Refracción: lo de atrás se ve corrido sobre todo por las ondas largas de
    // la película (amplio y parejo); el detalle de las partículas apenas suma.
    // El corrimiento es una distancia real: de lejos se ve más chico en pantalla.
    float cercania = 6.0 / max(z, 1.0);
    vec2 inclinacionPantalla = (viewMatrix * vec4(inclinacion, 0.0)).xy;
    vec2 corrimiento = (inclinacionPantalla * 0.009 + N.xy * 0.0012 * cuerpo) * cercania;
    float borroso = 0.0007 * cercania;
    vec3 fondo = texture2D(tFondo, uv + corrimiento).rgb * 0.4;
    fondo += texture2D(tFondo, uv + corrimiento + vec2(borroso, 0.0)).rgb * 0.15;
    fondo += texture2D(tFondo, uv + corrimiento - vec2(borroso, 0.0)).rgb * 0.15;
    fondo += texture2D(tFondo, uv + corrimiento + vec2(0.0, borroso * 2.5)).rgb * 0.15;
    fondo += texture2D(tFondo, uv + corrimiento - vec2(0.0, borroso * 2.5)).rgb * 0.15;

    // Fresnel del agua y lo que refleja: el entorno, los LEDs de enfrente y las
    // luces del borde que brillan en cada ondulación.
    float cosV = clamp(dot(Nw, Vw), 0.0, 1.0);
    float fresnel = 0.05 + 0.95 * pow(1.0 - cosV, 5.0);
    vec3 R = reflect(-Vw, Nw);
    vec3 reflejo = reflejoLeds(Pw, R);
    #ifdef ENVMAP_TYPE_CUBE_UV
      reflejo += textureCubeUV(envMap, R, 0.04).rgb * uEnvIntensidad;
    #endif
    #ifdef ENTORNO_CUBO
      reflejo += textureCube(envCubo, R).rgb * uEnvIntensidad;
    #endif
    float haciaBorde = pow(max(R.y, 0.0), 40.0) * exp(-caida / 1.6);
    reflejo += uLuz * uBrillo * haciaBorde * 3.0;

    // Luz que rodea al agua: el fondo promediado en un radio amplio.
    vec3 ambiente = vec3(0.0);
    float radioLuz = 0.03 * cercania;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854;
      ambiente += texture2D(tFondo, uv + vec2(cos(a), sin(a) * 1.6) * radioLuz).rgb;
    }
    ambiente *= 0.125;

    // Agua clara y tranquila: casi no tiñe lo que se ve a través y sólo junta un
    // poco de la luz que tiene cerca, como una pared mojada.
    vec3 transmitido = fondo * mix(vec3(1.0), vec3(0.9, 0.97, 1.0), cuerpo);
    vec3 espuma = ambiente * 0.16 * cuerpo;

    // El abismo se traga la cascada como al resto del pozo.
    float aten = pow(uR, (uMesaY - Pw.y) / uTramo) * (1.0 - smoothstep(uCaidaMax * 0.6, uCaidaMax, caida));
    vec3 color = transmitido * (1.0 - fresnel) + (espuma * (1.0 - fresnel) + reflejo * fresnel * confianza) * aten;
    color += onda(vec3(Pw.x, Pw.y - uMesaY, Pw.z)) * cuerpo * 0.7 * aten;
    // Donde hay agua dibuja su propio fondo refractado; en los bordes se funde.
    float alfa = smoothstep(0.0, 0.12, cuerpo) * smoothstep(0.0, 0.14, caida) * (1.0 - smoothstep(uCaidaMax * 0.6, uCaidaMax, caida));
    gl_FragColor = vec4(color * alfa, alfa);
  }
`;
}

const LEDS = { puntos: 1, tira: 2 };

function crearCascada(gl, { alta, pozo, isla, nivel, mesaY, tramo, onda, ondaGLSL, stencil }) {
  const ancho = 256;
  const alto = alta ? 256 : 128;
  const total = ancho * alto;
  const porEmisor = 64;
  const emisores = total / porEmisor;
  const perimetro = 4 * (pozo[0] + pozo[1]);

  // --- Simulación en la GPU ---------------------------------------------------
  const gpu = new GPUComputationRenderer(ancho, alto, gl);
  const pos0 = gpu.createTexture();
  const vel0 = gpu.createTexture();
  for (let i = 0; i < total; i += 1) {
    // Todas esperan su turno: al encender la cascada el agua empieza a volcarse.
    const k = i % porEmisor;
    pos0.image.data[i * 4 + 3] = -((k + Math.random() * 0.5) / porEmisor) * VIDA;
  }
  const varPos = gpu.addVariable('texturePosition', posicionGLSL, pos0);
  const varVel = gpu.addVariable('textureVelocity', velocidadGLSL, vel0);
  gpu.setVariableDependencies(varPos, [varPos, varVel]);
  gpu.setVariableDependencies(varVel, [varPos, varVel]);
  const comunes = {
    uDt: { value: 0 },
    uTiempo: { value: 0 },
    uSemilla: { value: 0 },
    uNivel: { value: nivel },
    uPozo: { value: new THREE.Vector2(pozo[0], pozo[1]) },
    uPerimetro: { value: perimetro },
    uEmisores: { value: emisores },
    uPorEmisor: { value: porEmisor },
    uVida: { value: VIDA },
    uCaidaMax: { value: CAIDA_MAXIMA },
    tDensidad: { value: null },
    uTexelDensidad: { value: new THREE.Vector2(1 / ANCHO_DENSIDAD, 1 / ALTO_DENSIDAD) },
  };
  Object.assign(varPos.material.uniforms, comunes);
  Object.assign(varVel.material.uniforms, comunes);
  const error = gpu.init();
  if (error !== null) {
    console.warn('Cascada: la GPU no admite la simulación', error);
    gpu.dispose();
    return null;
  }

  // --- Grilla de densidad para la cohesión -----------------------------------
  const densidad = new THREE.WebGLRenderTarget(ANCHO_DENSIDAD, ALTO_DENSIDAD, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    wrapS: THREE.RepeatWrapping,
  });
  const referencias = new Float32Array(total * 2);
  for (let i = 0; i < total; i += 1) {
    referencias[i * 2] = ((i % ancho) + 0.5) / ancho;
    referencias[i * 2 + 1] = (Math.floor(i / ancho) + 0.5) / alto;
  }
  const geoPuntos = new THREE.BufferGeometry();
  geoPuntos.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  geoPuntos.setAttribute('aRef', new THREE.BufferAttribute(referencias, 2));
  const matDensidad = new THREE.ShaderMaterial({
    // Sin tDensidad: este paso escribe justamente en esa textura.
    uniforms: {
      uNivel: comunes.uNivel,
      uPozo: comunes.uPozo,
      uPerimetro: comunes.uPerimetro,
      uCaidaMax: comunes.uCaidaMax,
      tPos: { value: null },
      tVel: { value: null },
    },
    vertexShader: vertexDensidad,
    fragmentShader: fragmentDensidad,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const puntos = new THREE.Points(geoPuntos, matDensidad);
  puntos.frustumCulled = false;
  const escenaDensidad = new THREE.Scene();
  escenaDensidad.add(puntos);
  const camaraPlana = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // --- Partículas para el render del fluido ----------------------------------
  const geoParticula = new THREE.InstancedBufferGeometry();
  geoParticula.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geoParticula.setIndex([0, 1, 2, 0, 2, 3]);
  geoParticula.setAttribute('aRef', new THREE.InstancedBufferAttribute(referencias, 2));
  geoParticula.instanceCount = total;
  // Radio según la separación entre emisores: las partículas se tocan y la película queda continua.
  const uniformsParticula = {
    tPos: { value: null },
    tVel: { value: null },
    uNivel: comunes.uNivel,
    uCaidaMax: comunes.uCaidaMax,
    uRadio: { value: (perimetro / emisores) * 0.95 },
  };
  // Doble cara: según hacia dónde cae, el cuadro estirado puede quedar de espaldas.
  const matProfundidad = new THREE.ShaderMaterial({ uniforms: uniformsParticula, vertexShader: vertexParticula, fragmentShader: fragmentProfundidad, side: THREE.DoubleSide });
  const matGrosor = new THREE.ShaderMaterial({
    uniforms: uniformsParticula,
    vertexShader: vertexParticula,
    fragmentShader: fragmentGrosor,
    side: THREE.DoubleSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const particulas = new THREE.Mesh(geoParticula, matProfundidad);
  particulas.frustumCulled = false;
  const escenaFluido = new THREE.Scene();
  escenaFluido.add(particulas);

  const escala = alta ? 1 : 0.5;
  const objetivos = { ancho: 0, alto: 0 };
  const crearObjetivo = (tipo, filtro, conProfundidad) => new THREE.WebGLRenderTarget(1, 1, {
    type: tipo,
    format: THREE.RedFormat,
    minFilter: filtro,
    magFilter: filtro,
    depthBuffer: conProfundidad,
  });
  const rtProf = crearObjetivo(THREE.FloatType, THREE.NearestFilter, true);
  const rtTemporal = crearObjetivo(THREE.FloatType, THREE.NearestFilter, false);
  const rtSuave = crearObjetivo(THREE.FloatType, THREE.NearestFilter, false);
  const rtGrosor = crearObjetivo(THREE.HalfFloatType, THREE.LinearFilter, false);
  const rtFondo = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const capasFondo = new THREE.Layers();
  capasFondo.set(CAPA_POZO);

  const matSuavizado = new THREE.ShaderMaterial({
    uniforms: {
      tProf: { value: null },
      uDir: { value: new THREE.Vector2() },
      uTexel: { value: new THREE.Vector2() },
      uFocal: { value: 1 },
      uRadioMundo: { value: 0.12 },
      uRango: { value: 0.2 },
      uEscalaRadio: { value: 1 },
    },
    vertexShader: vertexPantalla,
    fragmentShader: fragmentSuavizado,
    depthTest: false,
    depthWrite: false,
  });
  const quadSuavizado = new FullScreenQuad(matSuavizado);

  // --- Composición dentro de la escena principal -----------------------------
  const geoPantalla = new THREE.BufferGeometry();
  geoPantalla.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const matComposicion = new THREE.ShaderMaterial({
    uniforms: {
      ...onda,
      tProf: { value: rtSuave.texture },
      tGrosor: { value: rtGrosor.texture },
      tFondo: { value: null },
      uResolucion: { value: new THREE.Vector2(1, 1) },
      uTexelProf: { value: new THREE.Vector2(1, 1) },
      uProy: { value: new THREE.Matrix4() },
      uProyInv: { value: new THREE.Matrix4() },
      uCamaraMundo: { value: new THREE.Matrix4() },
      uActivo: { value: 0 },
      uLuz: { value: new THREE.Color() },
      uBrillo: { value: 1 },
      uR: { value: 0.945 },
      uTramo: { value: tramo },
      uNivel: { value: nivel },
      uMesaY: { value: mesaY },
      uCaidaMax: { value: CAIDA_MAXIMA },
      uEnvIntensidad: { value: 1 },
      uLedTipo: { value: 0 },
      uLedColor: { value: new THREE.Color() },
      uLedSep: { value: 0.26 },
      uCada: { value: 1 },
      uIsla: { value: new THREE.Vector2(isla[0], isla[1]) },
      uPozo: { value: new THREE.Vector2(pozo[0], pozo[1]) },
      envMap: { value: null },
      envCubo: { value: null },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: fragmentComposicion(ondaGLSL),
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    ...stencil,
  });
  const pantalla = new THREE.Mesh(geoPantalla, matComposicion);
  pantalla.frustumCulled = false;
  pantalla.renderOrder = 4;
  pantalla.raycast = () => null;

  let camaraPrincipal = null;
  // Sólo se compone en la cámara principal: el reflejo del tablero también
  // renderiza la escena y ahí este cuadro no corresponde.
  pantalla.onBeforeRender = (renderer, escena, camara) => {
    matComposicion.uniforms.uActivo.value = camara === camaraPrincipal ? 1 : 0;
    matComposicion.uniformsNeedUpdate = true;
  };

  let entornoActual = null;
  const colorLimpio = new THREE.Color();
  const tamano = new THREE.Vector2();

  function asegurarTamano(w, h) {
    const aw = Math.max(1, Math.round(w * escala));
    const ah = Math.max(1, Math.round(h * escala));
    if (aw === objetivos.ancho && ah === objetivos.alto) return;
    objetivos.ancho = aw;
    objetivos.alto = ah;
    [rtProf, rtTemporal, rtSuave, rtGrosor].forEach((rt) => rt.setSize(aw, ah));
    rtFondo.setSize(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)));
  }

  function ajustarEstilo(estilo) {
    const u = matComposicion.uniforms;
    u.uLuz.value.set(estilo.luz);
    u.uBrillo.value = estilo.brillo;
    u.uR.value = estilo.r;
    u.uCada.value = estilo.cada ?? 1;
    u.uLedTipo.value = LEDS[estilo.led] ?? 0;
    u.uLedColor.value.set(estilo.color).multiplyScalar(estilo.intensidad * 0.8);
    u.uLedSep.value = estilo.separacion || 0.26;
  }

  function actualizar(delta, tiempo, camara, escena) {
    camaraPrincipal = camara;
    const dt = Math.min(delta, 1 / 30);
    comunes.uDt.value = dt;
    comunes.uTiempo.value = tiempo;
    comunes.uSemilla.value = (comunes.uSemilla.value + 1) % 65536;

    const destinoPrevio = gl.getRenderTarget();
    gl.getClearColor(colorLimpio);
    const alfaLimpio = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);

    // 1. Densidad de agua sobre la pared (con las posiciones actuales).
    matDensidad.uniforms.tPos.value = gpu.getCurrentRenderTarget(varPos).texture;
    matDensidad.uniforms.tVel.value = gpu.getCurrentRenderTarget(varVel).texture;
    gl.setRenderTarget(densidad);
    gl.clear(true, false, false);
    gl.render(escenaDensidad, camaraPlana);
    comunes.tDensidad.value = densidad.texture;

    // 2. Un paso de la simulación.
    gpu.compute();

    // 3. Profundidad y espesor del agua vistos desde la cámara.
    gl.getDrawingBufferSize(tamano);
    asegurarTamano(tamano.x, tamano.y);
    uniformsParticula.tPos.value = gpu.getCurrentRenderTarget(varPos).texture;
    uniformsParticula.tVel.value = gpu.getCurrentRenderTarget(varVel).texture;
    particulas.material = matProfundidad;
    gl.setRenderTarget(rtProf);
    gl.clear(true, true, false);
    gl.render(escenaFluido, camara);
    particulas.material = matGrosor;
    gl.setRenderTarget(rtGrosor);
    gl.clear(true, false, false);
    gl.render(escenaFluido, camara);

    // 4. El pozo solo, para verlo refractado a través del agua.
    const capasCamara = camara.layers.mask;
    const sombrasAuto = gl.shadowMap.autoUpdate;
    const fondoEscena = escena.background;
    camara.layers.mask = capasFondo.mask;
    gl.shadowMap.autoUpdate = false;
    escena.background = null;
    gl.setRenderTarget(rtFondo);
    gl.clear(true, true, false);
    gl.render(escena, camara);
    camara.layers.mask = capasCamara;
    gl.shadowMap.autoUpdate = sombrasAuto;
    escena.background = fondoEscena;

    // 5. Suavizado en dos pasadas.
    const s = matSuavizado.uniforms;
    s.uTexel.value.set(1 / objetivos.ancho, 1 / objetivos.alto);
    s.uFocal.value = objetivos.alto / (2 * Math.tan(THREE.MathUtils.degToRad(camara.fov) / 2));
    s.tProf.value = rtProf.texture;
    s.uDir.value.set(1, 0);
    s.uEscalaRadio.value = 0.9;
    gl.setRenderTarget(rtTemporal);
    quadSuavizado.render(gl);
    s.tProf.value = rtTemporal.texture;
    s.uDir.value.set(0, 1);
    s.uEscalaRadio.value = 1.4;
    gl.setRenderTarget(rtSuave);
    quadSuavizado.render(gl);

    gl.setRenderTarget(destinoPrevio);
    gl.setClearColor(colorLimpio, alfaLimpio);

    // 6. Datos para la composición.
    const u = matComposicion.uniforms;
    u.uResolucion.value.copy(tamano);
    u.tFondo.value = rtFondo.texture;
    u.uTexelProf.value.set(1 / objetivos.ancho, 1 / objetivos.alto);
    u.uProy.value.copy(camara.projectionMatrix);
    u.uProyInv.value.copy(camara.projectionMatrixInverse);
    u.uCamaraMundo.value.copy(camara.matrixWorld);
    // El entorno puede llegar como cubo (drei lo deja así y three lo convierte al
    // usarlo) o ya prefiltrado (PMREM); el agua lee cualquiera de los dos.
    const entorno = escena.environment;
    if (entorno && entorno !== entornoActual && entorno.isCubeTexture) {
      entornoActual = entorno;
      matComposicion.defines = { ENTORNO_CUBO: '' };
      u.envCubo.value = entorno;
      matComposicion.needsUpdate = true;
    } else if (entorno && entorno !== entornoActual && entorno.mapping === THREE.CubeUVReflectionMapping) {
      entornoActual = entorno;
      const altoEntorno = entorno.image.height;
      const maxMip = Math.log2(altoEntorno) - 2;
      matComposicion.defines = {
        ENVMAP_TYPE_CUBE_UV: '',
        CUBEUV_TEXEL_WIDTH: 1 / (3 * Math.max(2 ** maxMip, 7 * 16)),
        CUBEUV_TEXEL_HEIGHT: 1 / altoEntorno,
        CUBEUV_MAX_MIP: `${maxMip.toFixed(1)}`,
      };
      u.envMap.value = entorno;
      matComposicion.needsUpdate = true;
    }
    u.uEnvIntensidad.value = escena.environmentIntensity ?? 1;
  }

  function dispose() {
    gpu.dispose();
    densidad.dispose();
    [rtProf, rtTemporal, rtSuave, rtGrosor, rtFondo].forEach((rt) => rt.dispose());
    geoPuntos.dispose();
    geoParticula.dispose();
    geoPantalla.dispose();
    [matDensidad, matProfundidad, matGrosor, matSuavizado, matComposicion].forEach((m) => m.dispose());
    quadSuavizado.dispose();
  }

  return { pantalla, actualizar, ajustarEstilo, dispose };
}

function CascadaFluida({ pozo, isla, nivel, mesaY, tramo, estilo, calidad = 'alta', onda, ondaGLSL, stencil }) {
  const { gl } = useThree();
  const cascada = useMemo(
    () => crearCascada(gl, { alta: calidad === 'alta', pozo, isla, nivel, mesaY, tramo, onda, ondaGLSL, stencil }),
    [gl, calidad, pozo, isla, nivel, mesaY, tramo, onda, ondaGLSL, stencil],
  );
  useEffect(() => () => cascada?.dispose(), [cascada]);
  if (cascada) cascada.ajustarEstilo(estilo);

  // Después de mover la cámara (prioridad -1) y antes del reflejo del tablero y del render.
  useFrame(({ camera, clock, scene }, delta) => {
    cascada?.actualizar(delta, clock.elapsedTime, camera, scene);
  }, -0.3);

  return cascada ? <primitive object={cascada.pantalla} /> : null;
}

export default memo(CascadaFluida);
