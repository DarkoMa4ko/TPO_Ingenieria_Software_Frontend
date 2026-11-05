import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

// Zoom con la rueda (o el trackpad) que responde al instante y llega suave: cada
// muesca fija una distancia objetivo (proporcional, así se siente igual cerca y
// lejos) y la cámara la alcanza con un deslizamiento corto. Reemplaza al zoom de
// OrbitControls, que salta a pasos chicos. Si los controles están apagados
// (cinemáticas, viajes de cámara, menú) no hace nada.
const POR_PIXEL = 0.0008; // ~8 % por muesca de rueda (100 px)
const DESLIZAMIENTO = 0.12; // s: constante de tiempo de la llegada

export default function ZoomSuave({ controlesRef }) {
  const { gl, camera } = useThree();
  const objetivo = useRef(null);
  const direccion = useRef(new THREE.Vector3());

  useEffect(() => {
    const lienzo = gl.domElement;
    const alGirar = (evento) => {
      const controles = controlesRef.current;
      if (!controles?.enabled) return;
      evento.preventDefault();
      // Líneas y páginas a píxeles, para que la rueda y el trackpad rindan parecido.
      const paso = evento.deltaMode === 1 ? evento.deltaY * 33 : evento.deltaMode === 2 ? evento.deltaY * 400 : evento.deltaY;
      const actual = objetivo.current ?? camera.position.distanceTo(controles.target);
      objetivo.current = THREE.MathUtils.clamp(actual * Math.exp(paso * POR_PIXEL), controles.minDistance, controles.maxDistance);
    };
    lienzo.addEventListener('wheel', alGirar, { passive: false });
    return () => lienzo.removeEventListener('wheel', alGirar);
  }, [gl, camera, controlesRef]);

  useFrame((_, delta) => {
    const controles = controlesRef.current;
    if (objetivo.current === null || !controles) return;
    if (!controles.enabled) {
      objetivo.current = null;
      return;
    }
    const d = direccion.current.subVectors(camera.position, controles.target);
    const distancia = d.length();
    const nueva = distancia + (objetivo.current - distancia) * (1 - Math.exp(-delta / DESLIZAMIENTO));
    camera.position.copy(controles.target).addScaledVector(d.normalize(), nueva);
    if (Math.abs(nueva - objetivo.current) < 0.002) objetivo.current = null;
  });

  return null;
}
