import { useSelector } from 'react-redux';
import EscenaAjedrez from './three/EscenaAjedrez.jsx';
import PanelPartida from './ui/PanelPartida.jsx';
import Historial from './ui/Historial.jsx';
import ModalPromocion from './ui/ModalPromocion.jsx';

export default function App() {
  const { id, fen, jugadas } = useSelector((s) => s.partida);

  return (
    <div className="app">
      <div className="escena">{fen && <EscenaAjedrez />}</div>
      <aside className="lateral">
        <PanelPartida />
        {id && <Historial jugadas={jugadas} />}
      </aside>
      <ModalPromocion />
    </div>
  );
}
