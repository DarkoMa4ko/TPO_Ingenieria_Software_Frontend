import { createContext, useContext, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Reloj de animación compartido. Avanza con el tiempo real multiplicado por
// `escala`, lo que permite cámaras lentas en las cinemáticas sin que cada
// animación tenga que conocerlas.
const ContextoReloj = createContext(null);

export function useReloj() {
  return useContext(ContextoReloj);
}

export function camaraLenta(reloj, escala, duracionReal) {
  reloj.current.objetivo = escala;
  reloj.current.hasta = reloj.current.real + duracionReal;
}

function Avance({ reloj }) {
  useFrame((_, delta) => {
    const r = reloj.current;
    const paso = Math.min(delta, 1 / 20);
    r.real += paso;
    const objetivo = r.real < r.hasta ? r.objetivo : 1;
    // Rampa suave hacia la escala pedida.
    r.escala += (objetivo - r.escala) * Math.min(1, paso * 9);
    r.t += paso * r.escala;
  }, -100);
  return null;
}

export function ProveedorReloj({ children }) {
  const reloj = useRef({ t: 0, real: 0, escala: 1, objetivo: 1, hasta: 0 });
  return (
    <ContextoReloj.Provider value={reloj}>
      <Avance reloj={reloj} />
      {children}
    </ContextoReloj.Provider>
  );
}
