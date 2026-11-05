import { useEffect, useState } from 'react';
import { IconoAjustes, IconoPanel, IconoSalir } from './Iconos.jsx';
import Vidrio from './Vidrio.jsx';
import { DURACION_SALIDA } from './useSalida.js';

// Barra de arriba, en vidrio. El botón del panel y el engranaje manejan el mismo
// panel lateral (seccion: la que se ve) y quedan marcados según lo que muestra.
// Muestra los botones de una sola pantalla a la vez: al pasar entre el inicio y la
// partida, los de la pantalla que se deja se van todos juntos (el engranaje
// también) y recién después entran los de la otra.
export default function BarraSuperior({ seccion, onPanel, onAjustes, enPartida, onMenu }) {
  const deseada = enPartida ? 'partida' : 'inicio';
  const [mostrada, setMostrada] = useState(deseada);
  const saliendo = mostrada !== deseada;

  useEffect(() => {
    if (!saliendo) return undefined;
    const temporizador = setTimeout(() => setMostrada(deseada), DURACION_SALIDA);
    return () => clearTimeout(temporizador);
  }, [saliendo, deseada]);

  const conPartida = seccion === 'partida';
  const conAjustes = seccion === 'ajustes';
  const engranaje = (
    <Vidrio
      as="button"
      type="button"
      radio={19}
      tinte={0.24}
      saliendo={saliendo}
      className={`boton-icono ${conAjustes ? 'activo' : ''}`}
      data-gota-origen="ajustes"
      onClick={onAjustes}
      aria-pressed={conAjustes}
      aria-label={conAjustes ? 'Cerrar ajustes' : 'Abrir ajustes'}
      title="Ajustes"
    >
      <IconoAjustes />
    </Vidrio>
  );

  return (
    <header className="barra">
      {mostrada === 'inicio' ? (
        <div className="barra-acciones" key="inicio">{engranaje}</div>
      ) : (
        <div className="barra-acciones" key="partida">
          <Vidrio
            as="button"
            type="button"
            radio={19}
            tinte={0.24}
            saliendo={saliendo}
            data-gota-origen="panel"
            className={`boton-icono ${conPartida ? 'activo' : ''}`}
            onClick={onPanel}
            aria-pressed={conPartida}
            aria-label={conPartida ? 'Ocultar el panel de la partida' : 'Mostrar el panel de la partida'}
            title="Panel de la partida (P)"
          >
            <IconoPanel />
          </Vidrio>
          {engranaje}
          <Vidrio as="button" type="button" radio={19} tinte={0.24} saliendo={saliendo} className="boton-icono" onClick={onMenu} aria-label="Salir de la partida" title="Salir al inicio">
            <IconoSalir />
          </Vidrio>
        </div>
      )}
    </header>
  );
}
