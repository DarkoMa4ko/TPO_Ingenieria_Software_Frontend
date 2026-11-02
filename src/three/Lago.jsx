import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { MESA_Y } from './Tablero.jsx';

// Lago nocturno en calma sobre el que apoya la mesa: un espejo oscuro que refleja
// el cielo, la luna, los fuegos artificiales y el cuerpo de la mesa, mecido por
// unas pocas ondas largas que estiran y ondulan los reflejos.
// Con la cascada interna el agua sube hasta el borde del pozo y se vuelca adentro.
// Para que sea barato, la cámara del reflejo sólo ve una capa propia: los objetos
// que deben reflejarse la activan con `layers-mask={MASCARA_REFLEJO}`.

export const CAPA_REFLEJO = 5;
export const MASCARA_REFLEJO = 1 | (1 << CAPA_REFLEJO);
// Justo debajo del cuerpo de la mesa (ver Mesa.jsx: alto 1.15 más el bisel).
export const NIVEL_AGUA = MESA_Y - 1.165;
// Con la cascada, apenas por debajo de la isla: el agua llega al filo del pozo.
export const NIVEL_CASCADA = MESA_Y - 0.012;
// Nivel actual, para quien necesita saber dónde está el agua (los fuegos artificiales).
export const ESTADO_LAGO = { nivel: NIVEL_AGUA };
const RADIO = 200;

const sombreadorAgua = {
  name: 'Lago',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTiempo: { value: 0 },
    uLuna: { value: new THREE.Vector3(0, 1, 0) },
    uMesa: { value: new THREE.Vector2(13, 10) },
    uColorMesa: { value: new THREE.Color('#7fb4ff') },
    uAltoLuz: { value: 1.2 },
    uCascada: { value: 0 },
    uHueco: { value: new THREE.Vector2(12.6, 9.6) },
    uIsla: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vMundo;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vMundo = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTiempo;
    uniform vec3 uLuna;
    uniform vec2 uMesa;
    uniform vec3 uColorMesa;
    uniform float uAltoLuz;
    uniform float uCascada;
    uniform vec2 uHueco;
    uniform vec2 uIsla;
    varying vec4 vUv;
    varying vec3 vMundo;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float ruido(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    // Pendiente de un lago en calma: unas pocas ondas largas y lentas, sin rizos.
    // Inclinan apenas la superficie y eso basta para que los reflejos se mezan.
    vec2 pendiente(vec2 p, float t) {
      vec2 g = vec2(0.0);
      g += 0.007 * cos(dot(p, vec2(0.83, 0.56)) * 0.45 + t * 0.5) * vec2(0.83, 0.56);
      g += 0.005 * cos(dot(p, vec2(-0.42, 0.91)) * 0.8 + t * 0.7) * vec2(-0.42, 0.91);
      g += 0.003 * cos(dot(p, vec2(0.97, -0.24)) * 1.5 + t * 0.95) * vec2(0.97, -0.24);
      return g;
    }

    void main() {
      // Con la cascada el agua llega a la altura de la isla: debajo de ella no hay
      // lago (taparía el chaflán de la isla).
      if (abs(vMundo.x) < uIsla.x && abs(vMundo.z) < uIsla.y) discard;
      // Y termina en el filo donde se vuelca: adentro (sobre el chaflán del cartel
      // y el pozo) no hay superficie que tape lo que hay abajo.
      if (uCascada > 0.5 && abs(vMundo.x) < uHueco.x && abs(vMundo.z) < uHueco.y) discard;
      vec3 v = normalize(cameraPosition - vMundo);
      float distancia = length(vMundo.xz - cameraPosition.xz);
      // Lejos el oleaje se aplana: el agua lejana queda como un espejo.
      float detalle = 1.0 - smoothstep(25.0, 140.0, distancia);
      vec2 g = pendiente(vMundo.xz, uTiempo) * mix(0.25, 1.0, detalle);

      // Cascada: el agua se acelera hacia el filo y se alisa como vidrio. Sus
      // pequeñas irregularidades se estiran en líneas largas en el sentido de la
      // corriente (sólo tuercen un poco el reflejo, no se pintan), y justo antes
      // de caer la superficie se curva y refleja la luz que sube del pozo.
      float curva = 0.0;
      float labio = 0.0;
      float lineas = 0.0;
      if (uCascada > 0.5) {
        vec2 q = abs(vMundo.xz) - uHueco;
        float dh = max(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0), 0.0);
        vec2 lado = sign(vMundo.xz);
        vec2 haciaFuera = (q.x > 0.0 && q.y > 0.0) ? normalize(q) * lado : (q.x > q.y ? vec2(lado.x, 0.0) : vec2(0.0, lado.y));
        vec2 aLoLargoDir = vec2(haciaFuera.y, -haciaFuera.x);
        float aLoLargo = q.x > q.y ? vMundo.z : vMundo.x;
        float corriente = 1.0 - smoothstep(0.0, 2.0, dh);
        float fase = sqrt(dh) * 2.5 + uTiempo * 0.6;
        lineas = ruido(vec2(aLoLargo * 3.0, fase * 0.6)) - 0.5;
        g += aLoLargoDir * lineas * 0.012 * corriente;
        curva = exp(-dh / 0.2);
        labio = exp(-dh / 0.03);
      }
      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

      // Reflejo nítido mecido por las ondas. Una inclinación hacia la cámara corre
      // el reflejo en vertical el doble que de costado: por eso en el agua la
      // luna y las estrellas se estiran en columnas que ondulan.
      vec2 haciaCamara = normalize(cameraPosition.xz - vMundo.xz);
      vec2 costado = vec2(-haciaCamara.y, haciaCamara.x);
      vec2 desvio = clamp(vec2(dot(g, costado) * 0.7, dot(g, haciaCamara) * 3.0), -0.03, 0.03);
      vec3 reflejo = texture2D(tDiffuse, vUv.xy / vUv.w + desvio).rgb;

      // Espejo oscuro: lo tenue del cielo se apaga en el agua y lo brillante (luna,
      // estrellas, fuegos) se refleja entero. Así el agua se distingue del cielo y
      // se ve pulida, no mate.
      float luminancia = dot(reflejo, vec3(0.2126, 0.7152, 0.0722));
      reflejo *= mix(0.45, 1.0, smoothstep(0.01, 0.25, luminancia));

      // Fresnel de agua: algo más oscura al mirar hacia abajo, espejada a lo lejos.
      float ndv = clamp(dot(n, v), 0.0, 1.0);
      float fresnel = 0.4 + 0.55 * pow(1.0 - ndv, 3.0);
      vec3 profundo = vec3(0.002, 0.006, 0.011);
      vec3 agua = mix(profundo, reflejo, fresnel);
      vec3 r = reflect(-v, n);

      // La luz de la mesa sobre el agua, de cualquier lado que se mire: un reflejo
      // suave del borde iluminado, más fuerte cerca de la mesa. Con la cascada la
      // luz sale de adentro del pozo y la toma la curva del filo (abajo).
      vec2 cerca = clamp(vMundo.xz, -uMesa, uMesa);
      float aMesa = length(vMundo.xz - cerca);
      vec3 fuente = vec3(cerca.x, vMundo.y + uAltoLuz, cerca.y);
      vec3 haciaFuente = normalize(fuente - vMundo);
      float destelloMesa = pow(max(dot(r, haciaFuente), 0.0), 40.0);
      float caida = exp(-aMesa / 4.0);
      agua += uColorMesa * (destelloMesa * 0.8 * (1.0 - uCascada) + 0.02) * caida;

      // El filo: una banda suave donde el agua se curva hacia el pozo y refleja su
      // luz, y una línea fina y nítida justo donde se vuelca.
      agua += uColorMesa * (curva * 0.2 * (1.0 + lineas * 0.2) + labio * 0.45);

      // Hacia el borde del disco se funde con el cielo: no se ve el final del lago.
      float borde = 1.0 - smoothstep(${(RADIO * 0.6).toFixed(1)}, ${RADIO.toFixed(1)}, length(vMundo.xz));
      gl_FragColor = vec4(agua * color, borde);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

function Lago({ calidad = 'alta', direccionLuna, colorMesa = '#7fb4ff', medidasMesa, nivel = NIVEL_AGUA, cascada = false }) {
  const agua = useMemo(() => {
    const alta = calidad === 'alta';
    const lago = new Reflector(new THREE.CircleGeometry(RADIO, 96), {
      color: '#ffffff',
      textureWidth: alta ? 2048 : 512,
      textureHeight: alta ? 2048 : 512,
      // A 2048 el reflejo ya sale nítido: el antialias del buffer costaba cuadros sin aportar.
      multisample: 0,
      shader: sombreadorAgua,
    });
    Object.assign(lago.material, {
      transparent: true,
      depthWrite: true,
      // El túnel del espejo infinito es geometría real que baja mucho más que el
      // agua: el lago no se dibuja donde el vidrio de la mesa marcó el stencil.
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
    });
    lago.camera.layers.set(CAPA_REFLEJO);
    lago.rotation.x = -Math.PI / 2;
    lago.renderOrder = -5;
    lago.raycast = () => null;
    return lago;
  }, [calidad]);

  // Nivel, luna, luz de la mesa y cascada cambian con los ajustes, sin rehacer el reflejo.
  const u = agua.material.uniforms;
  agua.position.y = nivel;
  ESTADO_LAGO.nivel = nivel;
  if (direccionLuna) u.uLuna.value.copy(direccionLuna);
  if (medidasMesa) {
    u.uMesa.value.set(medidasMesa.semiancho[0], medidasMesa.semiancho[1]);
    u.uAltoLuz.value = medidasMesa.altoBorde - nivel;
    if (medidasMesa.hueco) u.uHueco.value.set(medidasMesa.hueco[0], medidasMesa.hueco[1]);
    u.uIsla.value.set(medidasMesa.isla?.[0] ?? 0, medidasMesa.isla?.[1] ?? 0);
  }
  u.uColorMesa.value.set(colorMesa);
  u.uCascada.value = cascada ? 1 : 0;

  useEffect(() => () => agua.dispose(), [agua]);
  useEffect(() => () => { ESTADO_LAGO.nivel = NIVEL_AGUA; }, []);

  useFrame(({ clock }) => {
    u.uTiempo.value = clock.elapsedTime;
  });

  return <primitive object={agua} />;
}

export default memo(Lago);
