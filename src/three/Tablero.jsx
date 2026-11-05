import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { MeshReflectorMaterial } from '@react-three/drei';
import {
  MATERIAL_ACERO,
  MATERIAL_COORDENADAS_LUZ,
  MATERIAL_EBANO,
  MATERIAL_LATON,
  MATERIAL_TERCIOPELO,
  MATERIAL_VIDRIO_NEGRO,
  useRecursosTablero,
} from './materiales.js';
import { casillaDeCoords } from '../utils/fen.js';
import { MATERIAL_HOLO_INTRO, RECORTE_SOLIDO, aristasDe } from './holograma.js';
import CasillasLuz from './CasillasLuz.jsx';

export const MESA_Y = -0.43;
export const BANDEJA_X = 6.45;
// Altura del fieltro dentro de la bandeja (ver build_board.py en Blender).
export const FIELTRO_Y = MESA_Y + 0.17 - 0.095 + 0.012;

const sinRayos = () => null;

// Superficie de juego por estilo: el oscuro es más espejado (obsidiana pulida).
// Los arrays van como constantes: MeshReflectorMaterial rehace sus render targets
// y su pase de desenfoque si cambia la identidad de `blur`.
const SUPERFICIE = {
  oscuro: { textura: 'casillas_oscuro', mixStrength: 3.2, roughness: 0.55, normalScale: [0.25, 0.25], envMapIntensity: 1 },
  clasico: { textura: 'casillas', mixStrength: 1.6, roughness: 0.75, normalScale: [0.35, 0.35], envMapIntensity: 0.7 },
  // Vidrio negro liso: sin texturas; el reflejo se suma con Fresnel (ver reflejoVidrio).
  luz: { textura: null, color: '#030304', mixStrength: 2.4, mixBlur: 0.35, roughness: 0.06, envMapIntensity: 1.6 },
};
const DESENFOQUE = [260, 80];
const ROTACION_PLANO = [-Math.PI / 2, 0, 0];

// Cuadrícula de las casillas para el holograma (el plano tiene sólo dos triángulos).
function geometriaCuadricula() {
  const puntos = [];
  for (let i = -4; i <= 4; i += 1) {
    puntos.push(i, 0.004, -4, i, 0.004, 4, -4, 0.004, i, 4, 0.004, i);
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(puntos, 3));
  return geometria;
}

// drei corre el reflejo según el normal map: lo muestrea a `vUv * normalScale`
// (una zona estirada de la textura) y desplaza la lectura hasta un 5 % de la
// pantalla, así el reflejo de cada pieza quedaba corrido. Se lo deja como un
// temblor mínimo de la superficie, sin mover el reflejo de su lugar.
function corregirReflejo(material) {
  if (!material || material.userData.reflejoCorregido) return;
  material.userData.reflejoCorregido = true;
  const original = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    original.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('texture2D(normalMap, vUv * normalScale)', 'texture2D(normalMap, vUv)')
      .replace('coord.z * my_normal.xz * 0.05', 'coord.z * my_normal.xz * 0.003');
  };
  material.needsUpdate = true;
}

// En el vidrio negro, drei multiplica el reflejo por el color de la superficie y
// casi desaparece. Acá se suma como luz reflejada, débil mirando de frente y
// fuerte al ras (Fresnel), como en un vidrio de verdad.
function reflejoVidrio(material) {
  if (!material || material.userData.reflejoVidrio) return;
  material.userData.reflejoVidrio = true;
  const original = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    original.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      'diffuseColor.rgb = diffuseColor.rgb * ((1.0 - min(1.0, mirror)) + newMerge.rgb * mixStrength);',
      `float fresnelVidrio = 0.04 + 0.96 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
      totalEmissiveRadiance += newMerge.rgb * mixStrength * fresnelVidrio;`,
    );
  };
  material.needsUpdate = true;
}

function aCasilla(punto) {
  if (Math.abs(punto.x) > 4 || Math.abs(punto.z) > 4) return null;
  return casillaDeCoords(Math.max(-3.5, Math.min(3.5, punto.x)), Math.max(-3.5, Math.min(3.5, punto.z)));
}

function Tablero({ estilo = 'oscuro', interactivo, onCasilla, onHover }) {
  const { mallas, casillas, materiales } = useRecursosTablero();
  const superficie = SUPERFICIE[estilo] ?? SUPERFICIE.oscuro;
  const texturas = casillas[superficie.textura];
  const luz = estilo === 'luz';
  // El tablero de luz comparte con el oscuro el marco de vidrio negro, el acero y
  // las coordenadas retroiluminadas.
  const oscuro = estilo !== 'clasico';
  const metal = oscuro ? MATERIAL_ACERO : MATERIAL_LATON;
  const aristas = useMemo(() => ({
    cuadricula: geometriaCuadricula(),
    marco: aristasDe(mallas.marco, 20),
    coordenadas: aristasDe(mallas.coordenadas, 30),
    plinto: aristasDe(mallas.plinto, 20),
    bandeja: aristasDe(mallas.bandeja, 20),
    fieltro: aristasDe(mallas.fieltro, 20),
  }), [mallas]);

  return (
    <group>
      {/* Superficie de juego laqueada con reflejos difusos de las piezas. */}
      <mesh
        rotation={ROTACION_PLANO}
        receiveShadow
        onPointerDown={interactivo ? (evento) => {
          evento.stopPropagation();
          const casilla = aCasilla(evento.point);
          if (casilla) onCasilla(casilla);
        } : undefined}
        onPointerMove={interactivo ? (evento) => onHover(aCasilla(evento.point)) : undefined}
        onPointerOut={interactivo ? () => onHover(null) : undefined}
      >
        <planeGeometry args={[8, 8]} />
        <MeshReflectorMaterial
          key={estilo}
          ref={luz ? reflejoVidrio : corregirReflejo}
          {...(luz
            ? { color: superficie.color }
            : { map: texturas.color, roughnessMap: texturas.orm, aoMap: texturas.orm, normalMap: texturas.normal, normalScale: superficie.normalScale })}
          roughness={superficie.roughness}
          metalness={0}
          envMapIntensity={superficie.envMapIntensity}
          resolution={1024}
          blur={DESENFOQUE}
          mixBlur={superficie.mixBlur ?? 1.2}
          mixStrength={superficie.mixStrength}
          mixContrast={1}
          mirror={0}
          depthScale={1.1}
          minDepthThreshold={0.55}
          maxDepthThreshold={1.2}
          depthToBlurRatioBias={0.3}
          clippingPlanes={RECORTE_SOLIDO}
          clipShadows
        />
      </mesh>
      {/* En el tablero de luz, la pantalla; en los demás, sólo el pulso rojo de captura. */}
      <CasillasLuz pantalla={luz} />

      <mesh geometry={mallas.marco} material={oscuro ? materiales.marcoOscuro : materiales.marco} castShadow receiveShadow raycast={sinRayos} />
      <mesh geometry={mallas.filete} material={metal} receiveShadow raycast={sinRayos} />
      {/* En el tablero oscuro las coordenadas se ven retroiluminadas, como un teclado. */}
      <mesh geometry={mallas.coordenadas} material={oscuro ? MATERIAL_COORDENADAS_LUZ : metal} receiveShadow raycast={sinRayos} />
      <mesh geometry={mallas.plinto} material={oscuro ? MATERIAL_VIDRIO_NEGRO : MATERIAL_EBANO} castShadow raycast={sinRayos} />

      {/* Aristas holográficas: sólo se dibujan durante la materialización inicial. */}
      <lineSegments geometry={aristas.cuadricula} material={MATERIAL_HOLO_INTRO} raycast={sinRayos} />
      <lineSegments geometry={aristas.marco} material={MATERIAL_HOLO_INTRO} raycast={sinRayos} />
      <lineSegments geometry={aristas.coordenadas} material={MATERIAL_HOLO_INTRO} raycast={sinRayos} />
      <lineSegments geometry={aristas.plinto} material={MATERIAL_HOLO_INTRO} raycast={sinRayos} />

      {[-1, 1].map((lado) => (
        <group key={lado} position={[lado * BANDEJA_X, MESA_Y, 0]}>
          <mesh geometry={mallas.bandeja} material={materiales.bandeja} castShadow receiveShadow raycast={sinRayos} />
          <mesh geometry={mallas.fieltro} material={MATERIAL_TERCIOPELO} receiveShadow raycast={sinRayos} />
          <lineSegments geometry={aristas.bandeja} material={MATERIAL_HOLO_INTRO} raycast={sinRayos} />
          <lineSegments geometry={aristas.fieltro} material={MATERIAL_HOLO_INTRO} raycast={sinRayos} />
        </group>
      ))}
    </group>
  );
}

export default memo(Tablero);
