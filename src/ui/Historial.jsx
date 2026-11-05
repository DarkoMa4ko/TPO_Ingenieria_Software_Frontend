import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { esMate, notacionFigurada } from '../utils/resultado.js';
import { FEN_INICIAL } from '../utils/capturas.js';
import Desplazable from './Desplazable.jsx';

export default function Historial() {
  const { jugadas, fenInicial, finalizada, resultado } = useSelector((s) => s.partida);
  const mate = finalizada && esMate(resultado);
  const figuradas = useMemo(() => notacionFigurada(jugadas, fenInicial || FEN_INICIAL, mate), [jugadas, fenInicial, mate]);
  const listaRef = useRef(null);

  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTo({ top: lista.scrollHeight, behavior: 'smooth' });
  }, [jugadas.length]);

  const filas = [];
  for (let i = 0; i < figuradas.length; i += 2) filas.push([figuradas[i], figuradas[i + 1], i / 2 + 1]);
  const ultima = figuradas.length - 1;

  return (
    <div className="historial">
      <div className="panel-etiqueta-fila">
        <span className="panel-etiqueta">Jugadas</span>
        <span className="contador">{jugadas.length}</span>
      </div>

      {figuradas.length === 0 ? (
        <div className="historial-vacio">
          <span aria-hidden="true">♙</span>
          <p>Las blancas abren la partida.<br />Elegí una pieza para ver sus movimientos.</p>
        </div>
      ) : (
        <Desplazable as="ol" ref={listaRef} className="historial-desplazable" claseContenido="historial-lista">
          {filas.map(([blanca, negra, numero]) => (
            <li key={numero}>
              <span className="numero">{numero}</span>
              <span className={`jugada ${(numero - 1) * 2 === ultima ? 'ultima' : ''}`}>{blanca.texto}</span>
              <span className={`jugada ${negra && (numero - 1) * 2 + 1 === ultima ? 'ultima' : ''}`}>{negra?.texto ?? ''}</span>
            </li>
          ))}
        </Desplazable>
      )}
    </div>
  );
}
