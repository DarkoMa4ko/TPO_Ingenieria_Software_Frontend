// Interruptor de ajustes: fila clicable con la frase a la izquierda y el switch
// deslizante a la derecha. Verde cuando prende, gris cuando apaga (role=switch).
export default function Interruptor({ encendido, onAlternar, etiqueta, detalle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={encendido}
      className={`ajuste-fila ${encendido ? 'prendido' : 'apagado'}`}
      onClick={onAlternar}
    >
      <span className="ajuste-fila-texto">
        <strong>{etiqueta}</strong>
        {detalle && <small>{detalle}</small>}
      </span>
      <span className="interruptor" aria-hidden="true">
        <span className="interruptor-perilla" />
      </span>
    </button>
  );
}
