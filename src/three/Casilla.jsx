import { useMemo } from 'react';
import * as THREE from 'three';
import { casillaOffset } from '../utils/fen.js';

const MATERIAL_CLARO = new THREE.MeshStandardMaterial({ color: '#f0d9b5', roughness: 0.6 });
const MATERIAL_OSCURO = new THREE.MeshStandardMaterial({ color: '#b58863', roughness: 0.6 });
const MATERIAL_SELECCION = new THREE.MeshStandardMaterial({ color: '#f0d9b5', roughness: 0.6, emissive: '#2d6a30', emissiveIntensity: 0.9 });

const MATERIAL_JAQUE = new THREE.MeshStandardMaterial({ color: '#a93f3b', roughness: 0.58, emissive: '#a51c20', emissiveIntensity: 0.58 });

const GEOMETRIA = new THREE.BoxGeometry(1, 0.12, 1);

export default function Casilla({ casilla, seleccionada, enJaque, onClick }) {
  const { x, z } = casillaOffset(casilla);
  const material = useMemo(
    () => (enJaque ? MATERIAL_JAQUE : seleccionada ? MATERIAL_SELECCION : (casilla.charCodeAt(0) + Number(casilla[1])) % 2 === 0 ? MATERIAL_OSCURO : MATERIAL_CLARO),
    [seleccionada, enJaque, casilla],
  );
  return (
    <mesh
      geometry={GEOMETRIA}
      material={material}
      position={[x, -0.06, z]}
      receiveShadow
      castShadow
      onPointerDown={(evento) => {
        evento.stopPropagation();
        onClick(casilla);
      }}
    />
  );
}
