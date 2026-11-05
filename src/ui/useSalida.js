import { useEffect, useState } from 'react';

// Mantiene montado un elemento mientras hace su animación de salida (la gota que
// se contrae, ver .vidrio.saliendo en index.css). `saliendo` vale true durante
// esos `duracion` ms; después `montado` pasa a false.
export const DURACION_SALIDA = 440;

export default function useSalida(visible, duracion = DURACION_SALIDA) {
  const [montado, setMontado] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMontado(true);
      return undefined;
    }
    const temporizador = setTimeout(() => setMontado(false), duracion);
    return () => clearTimeout(temporizador);
  }, [visible, duracion]);
  return { montado: visible || montado, saliendo: !visible && montado };
}
