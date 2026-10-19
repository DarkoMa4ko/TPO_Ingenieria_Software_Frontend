import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { parseFen } from '../utils/fen.js';
import { casillaReyEnJaque } from '../utils/jaque.js';
import {
  seleccionar,
  deseleccionar,
  jugar,
  setearPromocion,
} from '../store/partidaSlice.js';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import Casilla from './Casilla.jsx';
import Pieza from './Piezas.jsx';
import Marca from './Marca.jsx';
import CamaraAnimada from './CamaraAnimada.jsx';
import { PERSPECTIVAS } from '../ui/perspectivas.js';

const COLUMNAS = 'abcdefgh';
const CASILLAS = COLUMNAS.split('').flatMap((columna) => [1, 2, 3, 4, 5, 6, 7, 8].map((fila) => columna + fila));

export default function EscenaAjedrez() {
  const { id, fen, finalizada, enJaque, cargando, legales, seleccion, promoverDe, perspectiva } = useSelector((s) => s.partida);
  const despachar = useDispatch();

  const piezas = useMemo(() => (fen ? parseFen(fen) : []), [fen]);
  const reyEnJaque = useMemo(() => casillaReyEnJaque(fen, enJaque), [fen, enJaque]);
  const destinos = useMemo(
    () => (seleccion ? legales.filter((m) => m.desde === seleccion) : []),
    [seleccion, legales],
  );

  if (!fen) return null;

  function alHacerClick(casilla) {
    if (!id || finalizada || cargando || promoverDe) return;
    const esDestino = destinos.find((m) => m.hasta === casilla);
    const esOrigenLegal = legales.some((m) => m.desde === casilla);

    if (esDestino) {
      if (destinos.filter((m) => m.hasta === casilla).some((m) => m.notacion.length > 4)) {
        despachar(setearPromocion({ desde: seleccion, hasta: casilla }));
      } else {
        despachar(jugar({ id, desde: seleccion, hasta: casilla }));
      }
      return;
    }
    if (esOrigenLegal && casilla !== seleccion) {
      despachar(seleccionar(casilla));
      return;
    }
    despachar(deseleccionar());
  }

  return (
    <Canvas shadows camera={{ position: PERSPECTIVAS[perspectiva].posicion, fov: 45 }}>
      <ambientLight intensity={0.65} />
      <directionalLight castShadow position={[6, 12, 7]} intensity={1.2} shadow-mapSize={[2048, 2048]} />
      <pointLight position={[-6, 6, -6]} intensity={0.35} />
      <CamaraAnimada perspectiva={perspectiva} />
      <group>
        {CASILLAS.map((casilla) => (
          <Casilla key={casilla} casilla={casilla} seleccionada={casilla === seleccion} enJaque={casilla === reyEnJaque} onClick={alHacerClick} />
        ))}
        {piezas.map((pieza) => (
          <Pieza key={pieza.id} pieza={pieza} />
        ))}
        {destinos.map((movimiento) => (
          <Marca
            key={movimiento.notacion}
            hasta={movimiento.hasta}
            captura={piezas.some((p) => p.casilla === movimiento.hasta)}
          />
        ))}
        <mesh receiveShadow position={[0, -0.14, 0]}>
          <boxGeometry args={[9.4, 0.16, 9.4]} />
          <meshStandardMaterial color="#3a2b1d" roughness={0.7} />
        </mesh>
      </group>
      <ContactShadows position={[0, -0.24, 0]} opacity={0.5} scale={14} blur={2.2} far={4} />
      <OrbitControls
        target={[0, 0, 0]}
        enablePan={false}
        minDistance={4}
        maxDistance={22}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
}
