import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PERSPECTIVAS } from '../ui/perspectivas.js';

const UMBRAL = 0.05;

export default function CamaraAnimada({ perspectiva }) {
  const objetivo = useRef(new THREE.Vector3(...PERSPECTIVAS[perspectiva].posicion));
  const animando = useRef(true);
  const anterior = useRef(perspectiva);

  if (anterior.current !== perspectiva) {
    anterior.current = perspectiva;
    objetivo.current.set(...PERSPECTIVAS[perspectiva].posicion);
    animando.current = true;
  }

  useFrame(({ camera }) => {
    if (!animando.current) return;
    camera.position.lerp(objetivo.current, 0.07);
    if (camera.position.distanceTo(objetivo.current) < UMBRAL) {
      animando.current = false;
    }
  });

  return null;
}
