import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CAPA_POZO } from './CascadaFluida.jsx';

// También en la capa del pozo: la cascada refracta esa capa, y donde la película
// arranca sobre el chaflán sin él se veía una línea negra.
const CAPAS = 1 | (1 << CAPA_POZO);

// Cartel de anuncios en el borde del pozo cuando el lago cae adentro (cascada).
// El filo del pozo está achaflanado a 45° desde el nivel del agua, en vidrio
// negro, mirando a la mesa. Detrás del vidrio hay una pantalla de LEDs como las
// de publicidad (diodos redondos con visera): el lago se vuelca en la arista de
// arriba, baja por el chaflán como una película que deforma los LEDs y sigue
// cayendo por la pared.
//
// Es alto, como los carteles de publicidad del perímetro de una cancha: entran
// logos y texto grande. El contenido corre alrededor de todo el pozo. En reposo
// rota entre las publicidades; la escena llama a anunciar() en cada captura,
// jaque, coronación o fin de partida, y el cartel pasa al anuncio con un rodillo
// vertical (lo viejo sube y sale, lo nuevo entra de abajo).

export const CHAFLAN_BORDE = 0.85;
// El contenido ocupa esta franja de la cara (distancia desde la arista de abajo).
const TEXTO_DESDE = 0.06;
const TEXTO_ALTO = 1.08;
const CANVAS_ALTO = 192;
// Ancho fijo: three.js reserva la textura con el tamaño de la primera subida y
// después sólo la pisa; un lienzo de otro ancho dejaba restos del texto viejo.
const CANVAS_ANCHO = 8192;
const VELOCIDAD = 3;
const RODILLO = 0.32;
// Cada cuánto cambia la publicidad en reposo.
const ROTACION = 8;

export const COLORES = {
  blanco: '#ffffff',
  rojo: '#ff1206',
  ambar: '#ffae1a',
  celeste: '#45c4ff',
  oro: '#ffd24a',
  fiesta: 'fiesta',
};

// Logos que pueden ir en el cartel, con sus colores. Uno blanco sobre
// transparente puede marcarse `tenir` y se enciende en el color que se pida; una
// imagen a todo color puede pedir otro `alto` (fracción de la franja), `brillo`
// (el panel le sube mucho la luz) o ir `pegado` (repetida sin espacio). En un
// cartel de LEDs el negro es un LED apagado: por eso a los sponsors con letras
// negras se les pasaron a blanco (public/texturas/sponsors).
const BASE = import.meta.env.BASE_URL ?? '/';
const LOGOS = {
  cocacola: { url: `${BASE}texturas/sponsors/cocacola.png` },
  mcdonalds: { url: `${BASE}texturas/sponsors/mcdonalds.svg` },
  starbucks: { url: `${BASE}texturas/sponsors/starbucks-blanco.png` },
  openai: { url: `${BASE}texturas/sponsors/openai.png` },
};

// Entre una repetición y otra (y entre las partes de un anuncio), sólo aire.
const SEPARADOR = ['            ', '#000000'];
const conSeparadores = (partes) => partes.flatMap((parte) => (LOGOS[parte.logo]?.pegado ? [parte] : [parte, SEPARADOR]));

// Publicidades de reposo, en rotación: sólo sponsors. Cada parte es
// [texto, color] o { logo, color }; para agregar una alcanza con sumarla a esta
// lista (y su imagen a LOGOS).
export const PUBLICIDAD = [
  [{ logo: 'cocacola' }],
  [{ logo: 'mcdonalds' }],
  [{ logo: 'starbucks' }],
  [{ logo: 'openai' }],
].map(conSeparadores);

// Pedidos de la escena: el cartel los toma en el próximo cuadro.
const pedido = { version: 0, mensaje: null };
// partes: [[texto, color] | { logo, color }, ...], separadas por un espacio; null
// vuelve a la publicidad.
export function anunciar(partes, { duracion = 7, alerta = null } = {}) {
  pedido.version += 1;
  pedido.mensaje = partes ? { partes: conSeparadores(partes), duracion, alerta } : null;
}

const vertex = /* glsl */ `
  attribute float aU;
  attribute float aV;
  varying float vU;
  varying float vV;
  void main() {
    vU = aU;
    vV = aV;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Sólo la luz de los LEDs (se suma sobre el vidrio negro, que pone los reflejos).
const fragment = /* glsl */ `
  uniform sampler2D uTexto;
  uniform float uTextoLargo;
  uniform float uFraccion;
  uniform float uScroll;
  uniform float uRodillo;
  uniform float uTiempo;
  uniform vec3 uAlerta;
  varying float vU;
  varying float vV;

  const float PASO = 0.028;
  const float LARGO = ${(CHAFLAN_BORDE * Math.SQRT2).toFixed(4)};

  vec3 muestra(vec2 p) {
    // v crece hacia arriba de la cara (el lienzo está dado vuelta en la textura).
    // Con el rodillo en 1 el texto subió y salió; en -1 todavía está debajo.
    float ty = (p.y - ${TEXTO_DESDE.toFixed(3)}) / ${TEXTO_ALTO.toFixed(3)} - uRodillo;
    if (ty < 0.0 || ty > 1.0) return vec3(0.0);
    return texture(uTexto, vec2(fract((p.x + uScroll) / uTextoLargo) * uFraccion, ty)).rgb;
  }

  void main() {
    // Película de agua: baja por el chaflán (s crece desde la arista de arriba) y
    // corre la imagen con ondas largas que viajan hacia abajo.
    float s = LARGO - vV;
    float fase = s * 7.0 - uTiempo * 5.5;
    vec2 desvio = vec2(
      sin(fase + vU * 1.3) * 0.5 + sin(fase * 0.6 - vU * 2.1) * 0.5,
      cos(fase * 0.8 + vU * 0.7)
    ) * 0.0045;
    vec2 p = vec2(vU, vV) + desvio;

    vec2 celda = p / PASO;
    vec2 centro = (floor(celda) + 0.5) * PASO;
    vec2 f = fract(celda) - 0.5;
    // De lejos los diodos son más chicos que un píxel: se pasa al texto liso
    // antes de que aparezca el moiré.
    vec2 w = fwidth(celda);
    float nitidez = 1.0 - smoothstep(0.3, 0.8, max(w.x, w.y));

    // Diodo redondo con núcleo caliente; la visera de cada fila sombrea su mitad de arriba.
    float r = length(f);
    float diodo = smoothstep(0.36, 0.26, r);
    float nucleo = smoothstep(0.2, 0.0, r);
    float visera = mix(1.0, 0.55, smoothstep(-0.1, 0.45, f.y));

    vec3 led = max(muestra(centro), uAlerta);
    vec3 liso = max(muestra(p), uAlerta);
    vec3 cerca = led * (diodo * 0.9 + nucleo * 0.8) * visera;
    vec3 color = mix(liso * 0.3, cerca, nitidez) * 4.0;
    // AgX desatura y lleva el rojo al salmón: un poco más de saturación lo compensa.
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = luma + (color - luma) * 1.5;
    // Diodos apagados que se adivinan detrás del vidrio.
    color += vec3(0.02, 0.022, 0.025) * diodo * nitidez;

    // Un poco de la luz de los LEDs que se esparce en la película de agua.
    color += liso * 0.12;
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Perfil en (r, y): r es la distancia hacia afuera desde el borde del pozo. En
// sentido horario, así la normal hacia afuera es (-dy, dr). El primer tramo es
// el chaflán (la pantalla), que llega justo al nivel del agua: ahí termina el lago.
function perfil(nivel) {
  return [
    [0, nivel - CHAFLAN_BORDE],
    [CHAFLAN_BORDE, nivel],
  ];
}

// Los cuatro lados de un tramo del perfil, con las esquinas a inglete.
const LADOS = [
  { punto: (px, pz, r, y, s) => [s * (px + r), y, -(pz + r)], normal: (nr, ny) => [0, ny, -nr] }, // atrás
  { punto: (px, pz, r, y, s) => [px + r, y, s * (pz + r)], normal: (nr, ny) => [nr, ny, 0] }, // derecha
  { punto: (px, pz, r, y, s) => [-s * (px + r), y, pz + r], normal: (nr, ny) => [0, ny, nr] }, // adelante
  { punto: (px, pz, r, y, s) => [-(px + r), y, -s * (pz + r)], normal: (nr, ny) => [-nr, ny, 0] }, // izquierda
];

function geometriaBorde(px, pz, nivel) {
  const puntos = perfil(nivel);
  const vidrio = [];
  const pantalla = { posiciones: [], us: [], vs: [] };
  // Línea media de la pantalla: de ahí sale la coordenada u, continua en las esquinas.
  // Leída desde el centro de la mesa, corre de izquierda a derecha en las cuatro caras.
  const rm = CHAFLAN_BORDE / 2;
  const mx = px + rm;
  const mz = pz + rm;
  const uDe = [
    (p) => p[0] + mx,
    (p) => 2 * mx + (p[2] + mz),
    (p) => 2 * mx + 2 * mz + (mx - p[0]),
    (p) => 4 * mx + 2 * mz + (mz - p[2]),
  ];

  for (let i = 0; i < puntos.length - 1; i += 1) {
    const [ri, yi] = puntos[i];
    const [rj, yj] = puntos[i + 1];
    const largo = Math.hypot(rj - ri, yj - yi);
    const nr = -(yj - yi) / largo;
    const ny = (rj - ri) / largo;
    LADOS.forEach((lado, l) => {
      const quad = [lado.punto(px, pz, ri, yi, -1), lado.punto(px, pz, ri, yi, 1), lado.punto(px, pz, rj, yj, 1), lado.punto(px, pz, rj, yj, -1)];
      const n = new THREE.Vector3(...lado.normal(nr, ny));
      const a = new THREE.Vector3(...quad[0]);
      const cruz = new THREE.Vector3().subVectors(new THREE.Vector3(...quad[1]), a)
        .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...quad[2]), a));
      const orden = cruz.dot(n) < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      orden.forEach((k) => vidrio.push(...quad[k]));
      if (i === 0) {
        // La luz de los LEDs, apenas despegada del vidrio del chaflán.
        orden.forEach((k) => {
          const q = new THREE.Vector3(...quad[k]).addScaledVector(n, 0.002);
          pantalla.posiciones.push(q.x, q.y, q.z);
          pantalla.us.push(uDe[l](quad[k]));
          pantalla.vs.push((quad[k][1] - yi) * Math.SQRT2);
        });
      }
    });
  }

  const geoVidrio = new THREE.BufferGeometry();
  geoVidrio.setAttribute('position', new THREE.Float32BufferAttribute(vidrio, 3));
  geoVidrio.computeVertexNormals();
  const geoPantalla = new THREE.BufferGeometry();
  geoPantalla.setAttribute('position', new THREE.Float32BufferAttribute(pantalla.posiciones, 3));
  geoPantalla.setAttribute('aU', new THREE.Float32BufferAttribute(pantalla.us, 1));
  geoPantalla.setAttribute('aV', new THREE.Float32BufferAttribute(pantalla.vs, 1));
  return { vidrio: geoVidrio, pantalla: geoPantalla };
}

// Una vuelta del mensaje en un lienzo (fondo negro: el color es el de los diodos).
function crearLienzo() {
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d');
  // Los logos se cargan una vez; al llegar se vuelve a dibujar el mensaje (alCargar).
  const imagenes = {};
  const resultado = { alCargar: null };
  const imagen = (nombre) => {
    if (!imagenes[nombre]) {
      const img = new Image();
      img.onload = () => resultado.alCargar?.();
      img.src = LOGOS[nombre].url;
      imagenes[nombre] = img;
    }
    const img = imagenes[nombre];
    return img.complete && img.naturalWidth ? img : null;
  };
  // Se piden todos de entrada: cuando les toque, ya están cargados.
  Object.keys(LOGOS).forEach(imagen);
  // Los logos ocupan el 80 % del alto de la franja; un banner puede pedir otro (`alto`).
  const altoDe = (nombre) => CANVAS_ALTO * (LOGOS[nombre].alto ?? 0.8);
  const tintado = document.createElement('canvas');
  const ctxTintado = tintado.getContext('2d');
  const fuente = `800 ${Math.round(CANVAS_ALTO * 0.66)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  lienzo.width = CANVAS_ANCHO;
  lienzo.height = CANVAS_ALTO;
  const textura = new THREE.CanvasTexture(lienzo);
  textura.minFilter = THREE.LinearFilter;
  // El lienzo está en sRGB: sin esto los colores se leían como lineales y salían lavados.
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.generateMipmaps = false;
  // Devuelve el largo de una vuelta del mensaje en la mesa y qué parte del lienzo ocupa.
  const dibujar = (partes) => {
    ctx.font = fuente;
    ctx.letterSpacing = '5px';
    const anchos = partes.map((parte) => {
      if (!parte.logo) return ctx.measureText(parte[0]).width;
      const img = imagen(parte.logo);
      return img ? (altoDe(parte.logo) * img.naturalWidth) / img.naturalHeight : 0;
    });
    const ancho = Math.min(CANVAS_ANCHO, Math.ceil(anchos.reduce((a, b) => a + b, 0)) + 8);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_ANCHO, CANVAS_ALTO);
    ctx.font = fuente;
    ctx.letterSpacing = '5px';
    ctx.textBaseline = 'middle';
    let x = 4;
    partes.forEach((parte, i) => {
      if (parte.logo) {
        const img = imagen(parte.logo);
        if (img && !LOGOS[parte.logo].tenir) {
          const alto = altoDe(parte.logo);
          ctx.globalAlpha = LOGOS[parte.logo].brillo ?? 1;
          ctx.drawImage(img, x, (CANVAS_ALTO - alto) / 2, anchos[i], alto);
          ctx.globalAlpha = 1;
        } else if (img) {
          // El logo encendido en un color: se pinta la silueta (su alfa) con ese color.
          tintado.width = Math.ceil(anchos[i]);
          tintado.height = Math.ceil(altoDe(parte.logo));
          ctxTintado.drawImage(img, 0, 0, tintado.width, tintado.height);
          ctxTintado.globalCompositeOperation = 'source-in';
          ctxTintado.fillStyle = parte.color ?? COLORES.blanco;
          ctxTintado.fillRect(0, 0, tintado.width, tintado.height);
          ctxTintado.globalCompositeOperation = 'source-over';
          ctx.drawImage(tintado, x, (CANVAS_ALTO - tintado.height) / 2);
        }
        x += anchos[i];
        return;
      }
      const [texto, color] = parte;
      if (color === 'fiesta') {
        const degradado = ctx.createLinearGradient(x, 0, x + anchos[i], 0);
        degradado.addColorStop(0, '#8a4dff');
        degradado.addColorStop(0.5, '#ff4fa3');
        degradado.addColorStop(1, '#ffc44a');
        ctx.fillStyle = degradado;
      } else {
        ctx.fillStyle = color;
      }
      ctx.fillText(texto, x, CANVAS_ALTO * 0.54);
      x += anchos[i];
    });
    textura.needsUpdate = true;
    return { largo: ancho * (TEXTO_ALTO / CANVAS_ALTO), fraccion: ancho / CANVAS_ANCHO };
  };
  return Object.assign(resultado, { textura, dibujar });
}

function CartelAnuncios({ pozo, nivel, material }) {
  const geometrias = useMemo(() => geometriaBorde(pozo[0], pozo[1], nivel), [pozo, nivel]);
  const lienzo = useMemo(crearLienzo, []);
  const materialPantalla = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uTexto: { value: lienzo.textura },
      uTextoLargo: { value: 10 },
      uFraccion: { value: 1 },
      uScroll: { value: 0 },
      uRodillo: { value: 0 },
      uTiempo: { value: 0 },
      uAlerta: { value: new THREE.Color(0, 0, 0) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [lienzo]);
  // Mensaje en pantalla (null: la publicidad de turno), el que espera, la
  // publicidad que toca y el estado del rodillo y las alertas.
  const estado = useRef({ version: -1, mostrado: null, siguiente: undefined, cambio: null, desde: 0, publicidad: 0 });
  const mostrar = useCallback((mensaje) => {
    const partes = mensaje?.partes ?? PUBLICIDAD[estado.current.publicidad % PUBLICIDAD.length];
    const { largo, fraccion } = lienzo.dibujar(partes);
    materialPantalla.uniforms.uTextoLargo.value = largo;
    materialPantalla.uniforms.uFraccion.value = fraccion;
  }, [lienzo, materialPantalla]);

  useEffect(() => {
    const dibujar = () => mostrar(estado.current.mostrado);
    lienzo.alCargar = dibujar;
    dibujar();
    document.fonts?.load(`800 ${Math.round(CANVAS_ALTO * 0.66)}px Helvetica`).then(dibujar).catch(() => {});
  }, [lienzo, mostrar]);

  useEffect(() => () => {
    materialPantalla.dispose();
    lienzo.textura.dispose();
    geometrias.vidrio.dispose();
    geometrias.pantalla.dispose();
  }, [materialPantalla, lienzo, geometrias]);

  const alerta = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const ahora = clock.elapsedTime;
    const u = materialPantalla.uniforms;
    const e = estado.current;
    u.uScroll.value = ahora * VELOCIDAD;
    u.uTiempo.value = ahora;

    // Pedido nuevo, o se terminó el tiempo del anuncio: cambio con el rodillo.
    if (pedido.version !== e.version) {
      e.version = pedido.version;
      e.siguiente = pedido.mensaje;
      e.cambio = ahora;
    } else if (e.cambio == null && ahora - e.desde > (e.mostrado ? e.mostrado.duracion : ROTACION)) {
      // Terminó el anuncio, o le toca a la próxima publicidad.
      e.siguiente = null;
      e.cambio = ahora;
    }

    if (e.cambio != null) {
      const t = (ahora - e.cambio) / RODILLO;
      if (t < 1) {
        u.uRodillo.value = t * t;
      } else if (e.siguiente !== undefined) {
        // A mitad del cambio se dibuja el mensaje nuevo, que entra desde abajo.
        if (e.siguiente === null && e.mostrado === null) e.publicidad += 1;
        e.mostrado = e.siguiente;
        e.siguiente = undefined;
        e.desde = ahora;
        mostrar(e.mostrado);
        u.uRodillo.value = -1;
      } else {
        const k = Math.min(1, (ahora - e.desde) / RODILLO);
        u.uRodillo.value = -(1 - k) * (1 - k);
        if (k >= 1) e.cambio = null;
      }
    }

    // Alerta: todo el cartel late dos veces en el color del anuncio, rápido.
    const s = ahora - e.desde;
    const pulso = e.mostrado?.alerta && e.siguiente === undefined
      ? Math.max(
        THREE.MathUtils.smoothstep(s, 0, 0.04) * (1 - THREE.MathUtils.smoothstep(s, 0.12, 0.22)),
        THREE.MathUtils.smoothstep(s, 0.3, 0.34) * (1 - THREE.MathUtils.smoothstep(s, 0.42, 0.56)),
      )
      : 0;
    if (pulso > 0) alerta.set(e.mostrado.alerta).multiplyScalar(pulso * 0.55);
    else alerta.setRGB(0, 0, 0);
    u.uAlerta.value.copy(alerta);
  });

  return (
    <group>
      <mesh geometry={geometrias.vidrio} material={material} receiveShadow raycast={() => null} layers-mask={CAPAS} />
      <mesh geometry={geometrias.pantalla} material={materialPantalla} renderOrder={4} raycast={() => null} layers-mask={CAPAS} />
    </group>
  );
}

export default memo(CartelAnuncios);
