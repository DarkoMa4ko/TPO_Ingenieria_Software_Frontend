import { useDispatch, useSelector } from 'react-redux';
import { jugar, ocultarPromocion } from '../store/partidaSlice.js';
import './ModalPromocion.css';

const OPCIONES = [
  { simbolo: 'q', etiqueta: 'Dama', icono: '♛' },
  { simbolo: 'r', etiqueta: 'Torre', icono: '♜' },
  { simbolo: 'b', etiqueta: 'Alfil', icono: '♝' },
  { simbolo: 'n', etiqueta: 'Caballo', icono: '♞' },
];

export default function ModalPromocion() {
  const { id, promoverDe, promocionOculta, finalizada, cargando } = useSelector((s) => s.partida);
  const despachar = useDispatch();

  if (!promoverDe || promocionOculta || finalizada) return null;

  const elegir = (simbolo) => despachar(jugar({ id, desde: promoverDe.desde, hasta: promoverDe.hasta, promocion: simbolo }));

  return (
    <div className="modal-fondo">
      <div className="modal">
        <h3>Elegí la pieza de promoción</h3>
        <div className="opciones">
          {OPCIONES.map(({ simbolo, etiqueta, icono }) => (
            <button key={simbolo} disabled={cargando} onClick={() => elegir(simbolo)}>
              {etiqueta}
              <span className="piezas" aria-hidden="true">{icono}</span>
            </button>
          ))}
        </div>
        <button className="ver-tablero" disabled={cargando} onClick={() => despachar(ocultarPromocion())}>
          Ver el tablero
        </button>
      </div>
    </div>
  );
}
