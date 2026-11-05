import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { INTRO, RELOJ_HOLO } from './holograma.js';
import { useLogoGrupo } from './logoGrupo.js';

// Pantalla en el chaflán de vidrio negro de la isla. Cuando el tablero termina de
// materializarse, el logo de UADE aparece con un glitch, centrado en cada cara;
// unos segundos después otro glitch da paso al logo del grupo, después a un
// cartel de LEDs (como el de la bolsa) con los integrantes, que corre alrededor
// de toda la mesa, y otro glitch vuelve al logo de UADE, y así en bucle.

// Para cambiar los nombres del cartel alcanza con editar esta lista.
export const INTEGRANTES = ['Tobias Ortiz', 'Federico Visentin', 'Luciano Galfrascoli', 'Ryu Miyasato', 'Erica Duque'];
const TEXTO_CARTEL = `${INTEGRANTES.join('   •   ')}   •   `.toUpperCase();

// Tiempos del ciclo, en segundos.
const ENTRADA = 2.4; // después del comienzo de la intro del tablero
const FALLA = 0.55;
const LOGO = 6;
const CARTEL = 6.5;
const VELOCIDAD_CARTEL = 2.4;

// Qué muestra la pantalla en cada tramo del ciclo (uCual en el shader).
const UADE = 0;
const GRUPO = 1;
const LEDS = 2;
const SECUENCIA = [{ cual: UADE, dura: LOGO }, { cual: GRUPO, dura: LOGO }, { cual: LEDS, dura: CARTEL }];

const LOGO_ANCHO = 1.38;
const LOGO_ALTO = LOGO_ANCHO * (512 / 1536);
// El logo del grupo con su nombre: ocupa casi todo el alto de la cara (con su margen).
const GRUPO_ALTO = 0.66;
// El texto ocupa esta franja del chaflán (distancia desde el quiebre, a lo largo de la cara).
const TEXTO_DESDE = 0.11;
const TEXTO_ALTO = 0.48;
const CANVAS_ALTO = 128;

const vertexPantalla = /* glsl */ `
  attribute float aU;
  attribute vec3 aEjeU;
  attribute float aCentro;
  uniform float uMesaY;
  varying float vU;
  varying float vV;
  varying float vCentro;
  varying vec3 vMundo;
  varying vec3 vEjeU;
  varying vec3 vNormal;
  void main() {
    vU = aU;
    // Distancia desde el quiebre bajando por la cara (chaflán a 45°).
    vV = (uMesaY - position.y) * 1.41421356;
    vCentro = aCentro;
    vEjeU = aEjeU;
    vNormal = normal;
    vec4 mundo = modelMatrix * vec4(position, 1.0);
    vMundo = mundo.xyz;
    gl_Position = projectionMatrix * viewMatrix * mundo;
  }
`;

const fragmentPantalla = /* glsl */ `
  uniform sampler2D uLogo;
  uniform sampler2D uLogoGrupo;
  uniform sampler2D uTexto;
  uniform samplerCube envCubo;
  uniform vec2 uTexelLogo;
  uniform vec2 uTexelGrupo;
  uniform vec2 uTamGrupo;
  uniform float uEnvIntensidad;
  uniform float uTiempo;
  uniform float uCual;
  uniform float uGlitch;
  uniform float uVisible;
  uniform float uScroll;
  uniform float uTextoLargo;
  uniform float uLargoCara;
  uniform float uTira;
  varying float vU;
  varying float vV;
  varying float vCentro;
  varying vec3 vMundo;
  varying vec3 vEjeU;
  varying vec3 vNormal;

  const vec3 LUZ = vec3(0.66, 0.81, 1.0) * 2.2;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float forma(sampler2D mapa, vec2 uv, float desenfoque) {
    return texture(mapa, uv, desenfoque).a;
  }

  // Logo de vidrio blanco retroiluminado (relieve sacado del alfa suavizado).
  // tam: ancho y alto del recuadro del logo en la cara.
  vec4 logo(float u, float v, sampler2D mapa, vec2 texel, vec2 tam) {
    // Centrado en la cara (vCentro es el u del medio de cada cara).
    vec2 luv = vec2((u - vCentro) / tam.x + 0.5,
                    1.0 - (v - (uLargoCara - tam.y) * 0.5) / tam.y);
    if (luv.x < 0.0 || luv.x > 1.0 || luv.y < 0.0 || luv.y > 1.0) return vec4(0.0);
    float letra = smoothstep(0.35, 0.65, forma(mapa, luv, 0.0));
    vec2 dx = vec2(texel.x * 6.0, 0.0);
    vec2 dy = vec2(0.0, texel.y * 6.0);
    float altoX = forma(mapa, luv + dx, 3.0) - forma(mapa, luv - dx, 3.0);
    float altoY = forma(mapa, luv + dy, 3.0) - forma(mapa, luv - dy, 3.0);
    float suave = forma(mapa, luv, 4.0);
    vec3 ejeV = cross(vNormal, vEjeU);
    vec3 n = normalize(vEjeU * (-altoX * 1.8) + ejeV * (-altoY * 1.8) + vNormal);
    vec3 vista = normalize(cameraPosition - vMundo);
    float fresnel = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, vista), 0.0, 1.0), 5.0);
    vec3 reflejo = vec3(0.0);
    #ifdef ENTORNO_CUBO
      reflejo = textureCube(envCubo, reflect(-vista, n)).rgb * uEnvIntensidad;
    #endif
    float bisel = clamp(length(vec2(altoX, altoY)) * 2.2, 0.0, 1.0);
    vec3 color = vec3(0.86, 0.91, 0.96) * (0.2 + 0.18 * bisel) + reflejo * (fresnel + bisel * 0.35);
    color += LUZ * mix(0.7, 1.0, smoothstep(0.5, 1.0, suave)) * (1.0 - 0.35 * bisel);
    // El halo se apaga antes del borde del recuadro del logo, así no se ve la caja.
    vec2 borde = min(luv, 1.0 - luv);
    float recuadro = smoothstep(0.0, 0.12, borde.x) * smoothstep(0.0, 0.25, borde.y);
    float derrame = clamp(suave - letra, 0.0, 1.0) * 0.22 * recuadro;
    float alfa = letra + derrame * (1.0 - letra);
    vec3 final = alfa > 0.0 ? (color * letra + LUZ * 0.35 * derrame * (1.0 - letra)) / alfa : vec3(0.0);
    return vec4(final, alfa);
  }

  // Cartel de LEDs: una grilla de puntos que se prenden donde pasa el texto.
  vec4 cartel(float u, float v) {
    const float PASO = 0.032;
    vec2 celda = vec2(u, v) / PASO;
    vec2 centro = (floor(celda) + 0.5) * PASO;
    float ty = 1.0 - (centro.y - ${TEXTO_DESDE.toFixed(3)}) / ${TEXTO_ALTO.toFixed(3)};
    float encendido = ty >= 0.0 && ty <= 1.0 ? texture(uTexto, vec2(fract((centro.x + uScroll) / uTextoLargo), ty)).a : 0.0;
    float punto = smoothstep(0.44, 0.3, length(fract(celda) - 0.5));
    // De lejos los puntos son más chicos que un píxel: se ve el texto liso.
    float nitidez = 1.0 - smoothstep(0.35, 0.9, fwidth(celda.x));
    float tyLiso = 1.0 - (v - ${TEXTO_DESDE.toFixed(3)}) / ${TEXTO_ALTO.toFixed(3)};
    float liso = tyLiso >= 0.0 && tyLiso <= 1.0 ? texture(uTexto, vec2(fract((u + uScroll) / uTextoLargo), tyLiso)).a : 0.0;
    float led = mix(liso, smoothstep(0.3, 0.6, encendido) * punto, nitidez);
    // Los LEDs apagados se adivinan en el vidrio.
    float apagado = punto * 0.07 * nitidez;
    return vec4(LUZ * led + vec3(0.45, 0.55, 0.7) * apagado * 0.6, max(led, apagado));
  }

  vec4 contenido(float u, float v) {
    if (uCual < 0.5) return logo(u, v, uLogo, uTexelLogo, vec2(${LOGO_ANCHO.toFixed(3)}, ${LOGO_ALTO.toFixed(3)}));
    if (uCual < 1.5) return logo(u, v, uLogoGrupo, uTexelGrupo, uTamGrupo);
    return cartel(u, v);
  }

  void main() {
    float u = vU;
    float v = vV;
    float g = uGlitch;
    float paso = floor(uTiempo * 24.0);

    // Glitch: bandas horizontales corridas, separación de color, bloques que se
    // apagan, líneas de barrido y un parpadeo de brillo.
    float banda = floor(v * 14.0);
    float salta = step(0.55, hash(vec2(banda, paso)));
    u += (hash(vec2(banda + 7.0, paso)) - 0.5) * 0.9 * g * salta;
    float separacion = 0.05 * g;
    vec4 rojo = contenido(u - separacion, v);
    vec4 centro = g > 0.001 ? contenido(u, v) : rojo;
    vec4 azul = g > 0.001 ? contenido(u + separacion, v) : rojo;
    vec3 color = vec3(rojo.r, centro.g, azul.b);
    float alfa = max(max(rojo.a, centro.a), azul.a);
    float bloque = hash(vec2(floor(vU * 2.5), floor(v * 6.0)) + paso);
    color *= 1.0 - step(1.0 - 0.35 * g, bloque) * 0.85;
    color *= 1.0 + (hash(vec2(paso, 3.1)) - 0.5) * 0.8 * g;
    color *= 1.0 - 0.25 * g * step(0.5, fract(v * 60.0));

    // Primera aparición: los bloques se van encendiendo.
    float aparece = step(hash(vec2(floor(vU * 4.0), floor(v * 8.0))), uVisible);
    alfa *= aparece;

    // La tira de luz del quiebre se refleja suave en el vidrio negro, justo debajo.
    float reflejoTira = exp(-v / 0.06) * 0.2 * uTira;
    vec3 premultiplicado = color * alfa + vec3(0.66, 0.81, 1.0) * reflejoTira;
    float alfaTotal = alfa + reflejoTira * (1.0 - alfa);
    gl_FragColor = vec4(alfaTotal > 0.0 ? premultiplicado / alfaTotal : vec3(0.0), alfaTotal);
  }
`;

// Anillo con las cuatro caras del chaflán, apenas despegado, con la distancia u
// a lo largo de la mesa (sentido horario visto desde arriba, leyendo de izquierda a
// derecha desde afuera) y el eje de la cara para el relieve del logo.
function geometriaPantalla(ix, iz, c, mesaY) {
  const ax = ix - c;
  const az = iz - c;
  const anchoMedio = ix - c / 2;
  const fondoMedio = iz - c / 2;
  const despegue = 0.003;
  const posiciones = [];
  const us = [];
  const ejes = [];
  const normales = [];
  const centros = [];
  const cara = (puntos, normal, eje, uDe, centro) => {
    const n = new THREE.Vector3(...normal).normalize();
    [[0, 1, 2], [0, 2, 3]].forEach((tri) => tri.forEach((i) => {
      const p = new THREE.Vector3(...puntos[i]).addScaledVector(n, despegue);
      posiciones.push(p.x, p.y + mesaY, p.z);
      us.push(uDe(puntos[i]));
      ejes.push(...eje);
      normales.push(n.x, n.y, n.z);
      centros.push(centro);
    }));
  };
  // Adelante (mira a las blancas): u crece con x.
  cara([[-ax, 0, az], [-ix, -c, iz], [ix, -c, iz], [ax, 0, az]], [0, 1, 1], [1, 0, 0], (p) => p[0] + anchoMedio, anchoMedio);
  // Derecha: u crece con -z.
  cara([[ax, 0, az], [ix, -c, iz], [ix, -c, -iz], [ax, 0, -az]], [1, 1, 0], [0, 0, -1], (p) => 2 * anchoMedio + (fondoMedio - p[2]), 2 * anchoMedio + fondoMedio);
  // Atrás: u crece con -x.
  cara([[ax, 0, -az], [ix, -c, -iz], [-ix, -c, -iz], [-ax, 0, -az]], [0, 1, -1], [-1, 0, 0], (p) => 2 * anchoMedio + 2 * fondoMedio + (anchoMedio - p[0]), 3 * anchoMedio + 2 * fondoMedio);
  // Izquierda: u crece con z.
  cara([[-ax, 0, -az], [-ix, -c, -iz], [-ix, -c, iz], [-ax, 0, az]], [-1, 1, 0], [0, 0, 1], (p) => 4 * anchoMedio + 2 * fondoMedio + (p[2] + fondoMedio), 4 * anchoMedio + 3 * fondoMedio);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute('normal', new THREE.Float32BufferAttribute(normales, 3));
  geometria.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
  geometria.setAttribute('aEjeU', new THREE.Float32BufferAttribute(ejes, 3));
  geometria.setAttribute('aCentro', new THREE.Float32BufferAttribute(centros, 1));
  return geometria;
}

// Texto del cartel en un lienzo: una vuelta del texto, que se repite al correr.
// La memoria de una textura se reserva con el tamaño de la primera subida y no
// crece: se dibuja antes de usarla y, si al cargar la fuente cambia el ancho, se
// libera para que se vuelva a reservar con el nuevo.
function crearTextoCartel() {
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d');
  const fuente = `600 ${Math.round(CANVAS_ALTO * 0.62)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const textura = new THREE.CanvasTexture(lienzo);
  textura.wrapS = THREE.RepeatWrapping;
  textura.minFilter = THREE.LinearFilter;
  textura.generateMipmaps = false;
  const dibujar = () => {
    ctx.font = fuente;
    ctx.letterSpacing = '6px';
    const ancho = Math.ceil(ctx.measureText(TEXTO_CARTEL).width) + 8;
    if (lienzo.width !== ancho || lienzo.height !== CANVAS_ALTO) {
      lienzo.width = ancho;
      lienzo.height = CANVAS_ALTO;
      textura.dispose();
    } else {
      ctx.clearRect(0, 0, ancho, CANVAS_ALTO);
    }
    ctx.font = fuente;
    ctx.letterSpacing = '6px';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(TEXTO_CARTEL, 4, CANVAS_ALTO * 0.53);
    textura.needsUpdate = true;
    return ancho;
  };
  dibujar();
  return { textura, dibujar };
}

// Estado del ciclo t segundos después de que aparece el logo: cada tramo de la
// secuencia termina con un glitch que, a la mitad, pasa al siguiente.
const DURACION_CICLO = SECUENCIA.reduce((suma, { dura }) => suma + dura + FALLA, 0);
function estadoCiclo(t) {
  if (t < 0) return { visible: 0, cual: UADE, glitch: 0 };
  if (t < FALLA) {
    const k = t / FALLA;
    return { visible: k, cual: UADE, glitch: Math.sin(Math.PI * k) };
  }
  let c = (t - FALLA) % DURACION_CICLO;
  for (let i = 0; i < SECUENCIA.length; i += 1) {
    const { cual, dura } = SECUENCIA[i];
    if (c < dura) return { visible: 1, cual, glitch: 0 };
    c -= dura;
    if (c < FALLA) {
      const k = c / FALLA;
      const siguiente = SECUENCIA[(i + 1) % SECUENCIA.length].cual;
      return { visible: 1, cual: k < 0.5 ? cual : siguiente, glitch: Math.sin(Math.PI * k) };
    }
    c -= FALLA;
  }
  return { visible: 1, cual: UADE, glitch: 0 };
}

// Mientras carga el logo del grupo: textura vacía.
const VACIA = new THREE.DataTexture(new Uint8Array(4), 1, 1);
VACIA.needsUpdate = true;

// Logo del grupo y, al lado, "Grupo 7", en un solo lienzo: así el conjunto queda
// centrado en cada cara y se dibuja como el logo (vidrio retroiluminado).
const NOMBRE_GRUPO = 'Grupo 7';
const ALTO_GRUPO = 512;
function componerGrupo({ textura }) {
  const imagen = textura.image;
  const alto = ALTO_GRUPO;
  const anchoLogo = Math.round((alto * imagen.width) / imagen.height);
  const fuente = `700 ${Math.round(alto * 0.27)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const medida = document.createElement('canvas').getContext('2d');
  medida.font = fuente;
  const anchoTexto = Math.ceil(medida.measureText(NOMBRE_GRUPO).width);
  // El logo ya trae su margen; el texto lleva uno parecido a la derecha.
  const hueco = Math.round(alto * 0.04);
  const margen = Math.round(alto * 0.12);
  const lienzo = document.createElement('canvas');
  lienzo.width = anchoLogo + hueco + anchoTexto + margen;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.drawImage(imagen, 0, 0, anchoLogo, alto);
  ctx.fillStyle = '#ffffff';
  ctx.font = fuente;
  ctx.textBaseline = 'middle';
  ctx.fillText(NOMBRE_GRUPO, anchoLogo + hueco, alto * 0.52);
  const compuesta = new THREE.CanvasTexture(lienzo);
  compuesta.anisotropy = 8;
  return { textura: compuesta, aspecto: lienzo.width / alto, texel: new THREE.Vector2(1 / lienzo.width, 1 / alto) };
}

function PantallaChaflan({ ix, iz, chaflan, mesaY, tira = true }) {
  const logo = useTexture('/texturas/logo_uade.png');
  const logoGrupo = useLogoGrupo();
  const grupo = useMemo(() => (logoGrupo ? componerGrupo(logoGrupo) : null), [logoGrupo]);
  const { scene } = useThree();
  const geometria = useMemo(() => geometriaPantalla(ix, iz, chaflan, mesaY), [ix, iz, chaflan, mesaY]);
  const texto = useMemo(crearTextoCartel, []);

  const material = useMemo(() => {
    logo.anisotropy = 8;
    return new THREE.ShaderMaterial({
      vertexShader: vertexPantalla,
      fragmentShader: fragmentPantalla,
      uniforms: {
        uLogo: { value: logo },
        uLogoGrupo: { value: VACIA },
        uTexto: { value: texto.textura },
        envCubo: { value: null },
        uTexelLogo: { value: new THREE.Vector2(1 / logo.image.width, 1 / logo.image.height) },
        uTexelGrupo: { value: new THREE.Vector2(1, 1) },
        uTamGrupo: { value: new THREE.Vector2(GRUPO_ALTO * 0.5, GRUPO_ALTO) },
        uEnvIntensidad: { value: 1 },
        uTiempo: { value: 0 },
        uCual: { value: UADE },
        uGlitch: { value: 0 },
        uVisible: { value: 0 },
        uScroll: { value: 0 },
        uTextoLargo: { value: 10 },
        uLargoCara: { value: chaflan * Math.SQRT2 },
        uMesaY: { value: mesaY },
        uTira: { value: 1 },
      },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }, [logo, texto, chaflan, mesaY]);

  // El largo del texto en la mesa sale del ancho del lienzo; se redibuja cuando carga la fuente.
  useEffect(() => {
    const medir = () => {
      const ancho = texto.dibujar();
      material.uniforms.uTextoLargo.value = ancho * (TEXTO_ALTO / CANVAS_ALTO);
    };
    medir();
    document.fonts?.load(`600 ${Math.round(CANVAS_ALTO * 0.62)}px Helvetica`).then(medir).catch(() => {});
  }, [texto, material]);

  useEffect(() => () => {
    material.dispose();
    geometria.dispose();
    texto.textura.dispose();
  }, [material, geometria, texto]);
  useEffect(() => () => grupo?.textura.dispose(), [grupo]);

  useFrame(() => {
    const ahora = RELOJ_HOLO.uTiempo.value;
    const u = material.uniforms;
    const estado = estadoCiclo(ahora - (INTRO.inicio + ENTRADA));
    u.uTiempo.value = ahora;
    u.uVisible.value = estado.visible;
    u.uCual.value = estado.cual;
    if (grupo && u.uLogoGrupo.value !== grupo.textura) {
      u.uLogoGrupo.value = grupo.textura;
      u.uTexelGrupo.value.copy(grupo.texel);
      u.uTamGrupo.value.set(GRUPO_ALTO * grupo.aspecto, GRUPO_ALTO);
    }
    u.uGlitch.value = estado.glitch;
    u.uScroll.value = ahora * VELOCIDAD_CARTEL;
    u.uTira.value = tira ? 1 : 0;
    const entorno = scene.environment;
    if (entorno && entorno.isCubeTexture && u.envCubo.value !== entorno) {
      u.envCubo.value = entorno;
      material.defines = { ENTORNO_CUBO: '' };
      material.needsUpdate = true;
    }
    u.uEnvIntensidad.value = scene.environmentIntensity ?? 1;
  });

  return <mesh geometry={geometria} material={material} renderOrder={2} frustumCulled={false} raycast={() => null} />;
}

export default memo(PantallaChaflan);
