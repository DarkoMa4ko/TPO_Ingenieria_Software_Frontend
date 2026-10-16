import { useMemo } from 'react';
import * as THREE from 'three';
import { casillaOffset } from '../utils/fen.js';

const MATERIAL_DESTINO = new THREE.MeshStandardMaterial({ color: '#769656', opacity: 0.55, transparent: true });
const MATERIAL_CAPTURA = new THREE.MeshStandardMaterial({ color: '#b33' , opacity: 0.55, transparent: true });

const GEOMETRIA_PUNTO = new THREE.CircleGeometry(0.16, 24);
const GEOMETRIA_ANILLO = new THREE.RingGeometry(0.3, 0.42, 32);

export default function Marca({ hasta, captura }) {
  const { x, z } = casillaOffset(hasta);
  return (
    <mesh
      geometry={captura ? GEOMETRIA_ANILLO : GEOMETRIA_PUNTO}
      material={captura ? MATERIAL_CAPTURA : MATERIAL_DESTINO}
      position={[x, 0.07, z]}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}
