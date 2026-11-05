// El orden es el de los botones del panel; cada una se elige también con su tecla.
// Las laterales se toman desde el lado del que se juega: izquierda y derecha de
// quien mira (con las negras, la cámara pasa al lado opuesto).
export const PERSPECTIVAS = {
  blancas: { etiqueta: 'Blancas', posicion: [0, 13.6, 15.8], tecla: '1' },
  negras: { etiqueta: 'Negras', posicion: [0, 13.6, -15.8], tecla: '2' },
  cenital: { etiqueta: 'Cenital', posicion: [0, 23, 0.01], tecla: '3', fov: 42 },
  izquierda: { etiqueta: 'Izquierda', posicion: [-19.5, 8.4, 0.01], tecla: '4', fov: 36, lateral: true },
  derecha: { etiqueta: 'Derecha', posicion: [19.5, 8.4, 0.01], tecla: '5', fov: 36, lateral: true },
};
