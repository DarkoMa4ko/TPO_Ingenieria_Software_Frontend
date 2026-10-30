import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PERSPECTIVAS } from '../ui/perspectivas.js';

const UMBRAL = 0.05;
const SUAVIDAD = 4;

export default function CamaraAnimada({ perspectiva, sincCamara }) {
  const objetivo = useRef(new THREE.Vector3(...PERSPECTIVAS[perspectiva].posicion));
  const animando = useRef(true);
  const { camera, controls } = useThree();

  useEffect(() => {
    objetivo.current.set(...PERSPECTIVAS[perspectiva].posicion);
    animando.current = true;
  }, [perspectiva, sincCamara]);

  useFrame((_, delta) => {
    if (!animando.current) return;

    if (controls) {
      controls.enabled = false;
    }
    camera.position.lerp(objetivo.current, 1 - Math.exp(-SUAVIDAD * delta));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);

    if (camera.position.distanceTo(objetivo.current) < UMBRAL) {
      camera.position.copy(objetivo.current);
      camera.lookAt(0, 0, 0);
      if (controls) {
        controls.update();
        controls.enabled = true;
      }
      animando.current = false;
    }
  });

  return null;
}
