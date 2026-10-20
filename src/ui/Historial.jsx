export default function Historial({ jugadas = [] }) {
  return (
    <div className="historial">
      <h2>Jugadas</h2>
      {jugadas.length === 0 ? (
        <p className="vacio">Todavía no se jugaron movimientos</p>
      ) : (
        <ol>
          {pares(jugadas).map(([blanca, negra, indice]) => (
            <li key={indice}>
              <span className="numero">{indice + 1}.</span>
              <span className={`item ${blanca && indice * 2 ===jugadas.length - 1 ? 'ultima-jugada' : ''} ` }>
                {blanca ? blanca.notacion : '-'}
              </span>
              <span className={`item ${negra && indice * 2 + 1===jugadas.length - 1 ? 'ultima-jugada' : ''} ` }>
                {negra ? negra.notacion : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function pares(jugadas) {
  const resultado = [];
  for (let i = 0; i < jugadas.length; i += 2) {
    resultado.push([jugadas[i], jugadas[i + 1], Math.floor(i / 2)]);
  }
  return resultado;
}
