import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PLANOS_INTRO, RELOJ_HOLO } from './holograma.js';
import { MESA_Y } from './Tablero.jsx';
import { useLogoGrupo } from './logoGrupo.js';

// Logo luminoso sobre la isla, donde va el tablero: se ve en el inicio y el
// holograma de cada partida lo reemplaza por el tablero (usa el plano de recorte
// del sólido invertido: donde ya hay tablero, no hay logo). Al volver al inicio,
// mientras el tablero se desarma, el logo vuelve a aparecer.

const ALTO = 8.4;
const ROTACION = [-Math.PI / 2, 0, 0];
const PLANO_LOGO = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

const vertexLogo = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const fragmentLogo = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform sampler2D uLogo;
  uniform float uTiempo;
  uniform float uAparicion;
  varying vec2 vUv;
  void main() {
    #include <clipping_planes_fragment>
    float forma = texture2D(uLogo, vUv).a;
    // Halo: el mismo logo en mipmaps cada vez más chicos (más difusos).
    float halo = texture2D(uLogo, vUv, 3.5).a;
    float aura = texture2D(uLogo, vUv, 5.0).a;
    // Se apaga antes del borde del recuadro, así no se nota la caja.
    vec2 borde = min(vUv, 1.0 - vUv);
    float recuadro = smoothstep(0.0, 0.1, borde.x) * smoothstep(0.0, 0.08, borde.y);
    // Respira despacio y cada tanto lo cruza un brillo en diagonal.
    float respira = 0.88 + 0.12 * sin(uTiempo * 1.2);
    float cruce = fract(uTiempo * 0.11) * 2.2 - 0.6;
    float brillo = exp(-pow((vUv.x * 0.45 + vUv.y * 0.55 - cruce) / 0.06, 2.0));
    vec3 luz = vec3(0.66, 0.81, 1.0);
    vec3 color = luz * (forma * (1.7 + brillo * 2.2) * respira + (halo * 0.45 + aura * 0.35) * recuadro * respira);
    gl_FragColor = vec4(color * uAparicion, 1.0);
  }
`;

function LogoInicio() {
  const logo = useLogoGrupo();
  const malla = useRef(null);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertexLogo,
    fragmentShader: fragmentLogo,
    uniforms: { uLogo: { value: null }, uTiempo: { value: 0 }, uAparicion: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    clipping: true,
    clippingPlanes: [PLANO_LOGO],
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), []);

  useFrame((_, delta) => {
    const solido = PLANOS_INTRO.solido;
    PLANO_LOGO.normal.copy(solido.normal).negate();
    PLANO_LOGO.constant = -solido.constant;
    // Con el tablero entero no queda nada del logo: ni se dibuja.
    const tapado = solido.constant > 1e4;
    if (malla.current) malla.current.visible = !tapado;
    const u = material.uniforms;
    u.uTiempo.value = RELOJ_HOLO.uTiempo.value;
    u.uAparicion.value = tapado ? 0 : Math.min(1, u.uAparicion.value + delta / 1.4);
  });

  if (!logo) return null;
  material.uniforms.uLogo.value = logo.textura;
  return (
    <mesh
      ref={malla}
      material={material}
      position={[0, MESA_Y + 0.012, 0]}
      rotation={ROTACION}
      scale={[ALTO * logo.aspecto, ALTO, 1]}
      renderOrder={3}
      frustumCulled={false}
      raycast={() => null}
    >
      <planeGeometry />
    </mesh>
  );
}

export default memo(LogoInicio);
