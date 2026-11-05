// Nombre de quien juega con cada color. Si no se cargó, el mismo respaldo que
// muestra el marcador.
export function nombreJugador(jugadores, blanco) {
  const nombre = (blanco ? jugadores?.blanco : jugadores?.negro)?.trim();
  return nombre || (blanco ? 'Jugador 1' : 'Jugador 2');
}
