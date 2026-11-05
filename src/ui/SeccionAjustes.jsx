import { useDispatch, useSelector } from 'react-redux';
import { OPCIONES, cambiarAjuste, alternarAjuste } from '../store/ajustesSlice.js';
import Desplazable from './Desplazable.jsx';
import Interruptor from './Interruptor.jsx';

// lista: una opción por fila, con la vista previa a la izquierda.
const SECCIONES = [
  { clave: 'tablero', titulo: 'Tablero' },
  { clave: 'mesa', titulo: 'Mesa', lista: true },
];

function Tilde() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.5 10.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sección "ajustes" del panel lateral. Los cambios se aplican al instante.
export default function SeccionAjustes() {
  const ajustes = useSelector((s) => s.ajustes);
  const despachar = useDispatch();

  return (
    <Desplazable className="ajustes-cuerpo" claseContenido="ajustes-lista">
      {SECCIONES.map(({ clave, titulo, lista }) => (
        <section key={clave} className="ajustes-seccion">
          <h3>{titulo}</h3>
          <div
            className={`ajustes-opciones ${lista ? 'en-lista' : ''}`}
            style={lista ? undefined : { '--columnas': OPCIONES[clave].length === 3 ? 3 : 2 }}
            role="radiogroup"
            aria-label={titulo}
          >
            {OPCIONES[clave].map(({ valor, etiqueta, detalle }) => {
              const activa = ajustes[clave] === valor;
              const elegir = () => despachar(cambiarAjuste({ clave, valor }));
              return (
                <button key={valor} type="button" role="radio" aria-checked={activa} className={`ajuste ${activa ? 'activo' : ''}`} onClick={elegir}>
                  <span className={`muestra muestra-${clave}-${valor}`} aria-hidden="true">
                    <span className="ajuste-tilde"><Tilde /></span>
                  </span>
                  <span className="ajuste-texto">
                    <strong>{etiqueta}</strong>
                    <small>{detalle}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* Efectos opcionales de la captura, bajo la sección de Mesa. */}
      <section className="ajustes-seccion">
        <h3>Capturas</h3>
        <div className="ajustes-opciones en-lista ajustes-interruptores">
          <Interruptor
            encendido={ajustes.cinematicaCaptura}
            onAlternar={() => despachar(alternarAjuste('cinematicaCaptura'))}
            etiqueta="Cinemática de captura"
            detalle="La cámara se acerca al impacto y vuelve"
          />
          <Interruptor
            encendido={ajustes.efectosCaptura}
            onAlternar={() => despachar(alternarAjuste('efectosCaptura'))}
            etiqueta="Efectos de captura"
            detalle="Onda al impacto y casillas titilando en rojo"
          />
        </div>
      </section>
    </Desplazable>
  );
}
