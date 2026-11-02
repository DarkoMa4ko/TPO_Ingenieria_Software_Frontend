import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { nombreJugador } from '../utils/jugadores.js';

// Rótulo animado "Jaque" sincronizado con el aterrizaje de la pieza: un rótulo
// chico arriba, la palabra grande y una barra roja que se dibuja debajo.
export default function AvisoJaque() {
  const { enJaque, finalizada, jugadas, turno, jugadores } = useSelector((s) => s.partida);
  const [visible, setVisible] = useState(null);

  useEffect(() => {
    if (!enJaque || finalizada || !jugadas.length) return undefined;
    const mostrar = setTimeout(() => setVisible(jugadas.length), 650);
    const ocultar = setTimeout(() => setVisible(null), 2700);
    return () => { clearTimeout(mostrar); clearTimeout(ocultar); };
  }, [enJaque, finalizada, jugadas.length]);

  if (visible == null) return null;
  return (
    <div className="aviso-jaque" role="status" key={visible}>
      <span className="aviso-sub">Al rey de {nombreJugador(jugadores, turno === 'w')}</span>
      <span className="aviso-texto">Jaque</span>
      <span className="aviso-linea" aria-hidden="true" />
    </div>
  );
}
