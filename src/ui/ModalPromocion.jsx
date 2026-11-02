import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { cancelarPromocion, jugar } from '../store/partidaSlice.js';
import { glifo } from '../utils/resultado.js';
import Vidrio from './Vidrio.jsx';
import useSalida from './useSalida.js';

const OPCIONES = [
  { simbolo: 'q', etiqueta: 'Dama', tecla: 'D' },
  { simbolo: 'r', etiqueta: 'Torre', tecla: 'T' },
  { simbolo: 'b', etiqueta: 'Alfil', tecla: 'A' },
  { simbolo: 'n', etiqueta: 'Caballo', tecla: 'C' },
];

export default function ModalPromocion() {
  const { id, promoverDe, cargando, turno } = useSelector((s) => s.partida);
  const despachar = useDispatch();
  const blanco = turno === 'w';
  const ultima = useRef(promoverDe);
  if (promoverDe) ultima.current = promoverDe;
  const presencia = useSalida(Boolean(promoverDe));

  const elegir = (simbolo) => despachar(
    jugar({ id, desde: promoverDe.desde, hasta: promoverDe.hasta, promocion: simbolo }),
  );

  useEffect(() => {
    if (!promoverDe) return undefined;
    const alTeclear = (evento) => {
      if (evento.key === 'Escape') despachar(cancelarPromocion());
      const opcion = OPCIONES.find((o) => o.tecla.toLowerCase() === evento.key.toLowerCase());
      if (opcion && !cargando) elegir(opcion.simbolo);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoverDe, cargando]);

  if (!presencia.montado) return null;
  const { saliendo } = presencia;

  return (
    <div className={`modal-fondo ${saliendo ? 'saliendo' : ''}`}>
      <Vidrio radio={26} tinte={0.5} className="modal" saliendo={saliendo} role="dialog" aria-modal="true" aria-labelledby="promocion-titulo">
        <span className="eyebrow">Promoción · {ultima.current?.hasta}</span>
        <h3 id="promocion-titulo">Elegí en qué se corona tu peón</h3>

        <div className="opciones">
          {OPCIONES.map(({ simbolo, etiqueta, tecla }, indice) => (
            <button
              key={simbolo}
              type="button"
              className="opcion"
              style={{ '--d': `${indice * 0.06}s` }}
              disabled={cargando || saliendo}
              onClick={() => elegir(simbolo)}
              autoFocus={indice === 0}
            >
              <span className={`glifo ${blanco ? 'blanco' : 'negro'}`} aria-hidden="true">{glifo(simbolo, blanco)}</span>
              <span className="opcion-nombre">{etiqueta}</span>
              <kbd>{tecla}</kbd>
            </button>
          ))}
        </div>

        <button type="button" className="boton-texto" disabled={cargando || saliendo} onClick={() => despachar(cancelarPromocion())}>
          Cancelar
        </button>
      </Vidrio>
    </div>
  );
}
