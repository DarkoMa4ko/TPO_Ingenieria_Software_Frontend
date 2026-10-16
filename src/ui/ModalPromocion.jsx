import { useDispatch, useSelector } from 'react-redux';
import { cancelarPromocion, jugar } from '../store/partidaSlice.js';

const OPCIONES = [
  { simbolo: 'q', etiqueta: 'Dama' },
  { simbolo: 'r', etiqueta: 'Torre' },
  { simbolo: 'b', etiqueta: 'Alfil' },
  { simbolo: 'n', etiqueta: 'Caballo' },
];

export default function ModalPromocion() {
  const { id, promoverDe, cargando } = useSelector((s) => s.partida);
  const despachar = useDispatch();

  if (!promoverDe) return null;

  const elegir = (simbolo) => despachar(jugar({ id, desde: promoverDe.desde, hasta: promoverDe.hasta, promocion: simbolo }));

  return (
    <div className="modal-fondo">
      <div className="modal">
        <h3>Elegí la pieza de promoción</h3>
        <div className="opciones">
          {OPCIONES.map(({ simbolo, etiqueta }) => (
            <button key={simbolo} disabled={cargando} onClick={() => elegir(simbolo)}>
              {etiqueta}
            </button>
          ))}
          <button className="cancelar" disabled={cargando} onClick={() => despachar(cancelarPromocion())}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
