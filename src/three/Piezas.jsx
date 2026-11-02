import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MATERIAL_LATON, useRecursosPiezas } from './materiales.js';
import { MATERIAL_HOLO_INTRO } from './holograma.js';
import { useReloj } from './Reloj.jsx';

// Los caballos miran hacia el rival y el rey queda con la cruz de frente a los
// jugadores (girado al azar se veía torcida). El resto se gira al azar, de forma
// estable por casilla, para que las vetas del mármol no se repitan.
export function giroDe(tipo, blanco, semilla = '') {
  if (tipo === 'n') return blanco ? Math.PI : 0;
  if (tipo === 'k') return 0;
  let h = 0;
  for (const caracter of semilla) h = (h * 31 + caracter.charCodeAt(0)) % 997;
  return (h / 997) * Math.PI * 2;
}

const sinRayos = () => null;

/**
 * `materiales` permite reemplazar los materiales (lo usa la pieza capturada para
 * su propio recorte holográfico): { cuerpo, cruz, holo }.
 */
export function PiezaModelo({ tipo, blanco, sombras = true, semilla = '', materiales: propios = null }) {
  const { geometrias, materiales } = useRecursosPiezas();
  const geometria = geometrias[tipo];
  const cuerpo = propios?.cuerpo ?? materiales[`${tipo}${blanco ? 'b' : 'n'}`];
  const cruz = propios?.cruz ?? MATERIAL_LATON;
  const holo = propios?.holo ?? MATERIAL_HOLO_INTRO;

  return (
    <group rotation={[0, giroDe(tipo, blanco, semilla), 0]}>
      <mesh geometry={geometria.cuerpo} material={cuerpo} castShadow={sombras} receiveShadow={sombras} />
      {geometria.cruz && <mesh geometry={geometria.cruz} material={cruz} castShadow={sombras} />}
      <lineSegments geometry={geometria.aristas} material={holo} raycast={sinRayos} />
      {geometria.aristasCruz && <lineSegments geometry={geometria.aristasCruz} material={holo} raycast={sinRayos} />}
    </group>
  );
}

export default function Pieza({ pieza, seleccionada, resaltada, onClick, onHover }) {
  const ref = useRef(null);
  const reloj = useReloj();
  const elevacion = useRef(0);
  const x = pieza.file - 3.5;
  const z = 3.5 - pieza.rank;

  useFrame((_, delta) => {
    const grupo = ref.current;
    if (!grupo) return;
    const objetivo = seleccionada ? 0.22 : resaltada ? 0.05 : 0;
    elevacion.current += (objetivo - elevacion.current) * Math.min(1, delta * 12);
    grupo.position.y = 0.002 + elevacion.current;
    // Balanceo muy leve mientras está seleccionada.
    grupo.rotation.z = seleccionada ? Math.sin(reloj.current.t * 3.2) * 0.025 : grupo.rotation.z * 0.85;
  }, -1);

  return (
    <group
      ref={ref}
      position={[x, 0.002, z]}
      onPointerDown={onClick && ((evento) => { evento.stopPropagation(); onClick(pieza.casilla); })}
      onPointerOver={onHover && ((evento) => { evento.stopPropagation(); onHover(pieza.casilla); })}
      onPointerOut={onHover && (() => onHover(null))}
    >
      <PiezaModelo tipo={pieza.tipo} blanco={pieza.blanco} semilla={pieza.casilla} />
    </group>
  );
}
