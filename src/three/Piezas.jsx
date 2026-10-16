import { useMemo } from 'react';
import * as THREE from 'three';
import { geometriaDe, ALTURAS } from './geometrias.js';

const MATERIALES = {
  blanco: new THREE.MeshStandardMaterial({ color: '#f5e4c8', roughness: 0.35, metalness: 0.05 }),
  negro: new THREE.MeshStandardMaterial({ color: '#33312e', roughness: 0.4, metalness: 0.1 }),
  detalle: new THREE.MeshStandardMaterial({ color: '#8a1f1f', roughness: 0.4 }),
};

function Cuerpo({ tipo, blanco }) {
  const geometria = useMemo(() => geometriaDe(tipo), [tipo]);
  const material = blanco ? MATERIALES.blanco : MATERIALES.negro;
  return (
    <>
      <mesh geometry={geometria} material={material} castShadow receiveShadow />
      {tipo === 'b' && (
        <mesh material={MATERIALES.detalle} position={[0, ALTURAS.b - 0.06, 0]}>
          <sphereGeometry args={[0.045, 12, 12]} />
        </mesh>
      )}
      {tipo === 'q' && (
        <mesh material={material} position={[0, ALTURAS.q - 0.02, 0]}>
          <sphereGeometry args={[0.09, 12, 12]} />
        </mesh>
      )}
      {tipo === 'k' && <Cruz material={material} altura={ALTURAS.k} />}
    </>
  );
}

function Cruz({ material, altura }) {
  return (
    <group position={[0, altura + 0.08, 0]}>
      <mesh material={material} castShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[0.05, 0.24, 0.05]} />
      </mesh>
      <mesh material={material} castShadow position={[0, 0.09, 0]}>
        <boxGeometry args={[0.18, 0.05, 0.05]} />
      </mesh>
    </group>
  );
}

function CabezaCaballo({ blanco, altura }) {
  const material = blanco ? MATERIALES.blanco : MATERIALES.negro;
  return (
    <group position={[0, altura - 0.04, 0]}>
      <mesh material={material} castShadow position={[0.06, 0.22, 0]}>
        <boxGeometry args={[0.16, 0.5, 0.26]} />
      </mesh>
      <mesh material={material} castShadow position={[0.2, 0.36, 0]}>
        <boxGeometry args={[0.12, 0.3, 0.24]} />
      </mesh>
      <mesh material={material} castShadow position={[-0.02, 0.12, 0]} rotation={[0, 0, -0.9]}>
        <boxGeometry args={[0.3, 0.1, 0.22]} />
      </mesh>
    </group>
  );
}

export default function Pieza({ pieza }) {
  const x = pieza.file - 3.5;
  const z = 3.5 - pieza.rank;
  if (pieza.tipo === 'n') {
    return (
      <group position={[x, 0, z]}>
        <Cuerpo tipo="n" blanco={pieza.blanco} />
        <CabezaCaballo blanco={pieza.blanco} altura={ALTURAS.n} />
      </group>
    );
  }
  return (
    <group position={[x, 0, z]}>
      <Cuerpo tipo={pieza.tipo} blanco={pieza.blanco} />
    </group>
  );
}
