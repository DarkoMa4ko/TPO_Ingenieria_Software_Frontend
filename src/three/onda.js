import * as THREE from 'three';

// Onda de color al capturar. Uniforms compartidos por todo lo que la muestra:
// paredes y LEDs del pozo, el resplandor que sale por el vidrio, la cascada y
// las casillas del tablero de luz. Un solo disparo los coordina a todos.
export const ONDA = {
  uTiempo: { value: 0 },
  uInicioOnda: { value: -100 },
  uOrigenOnda: { value: new THREE.Vector2() },
  // 0 → 1 al terminar la partida: los LEDs recorren el degradé en bucle (festejo).
  uFiesta: { value: 0 },
};

// Dura más que la cinemática de captura, para verla recorrer la mesa al volver la cámara.
export const DURACION_ONDA = 7.5;

export function dispararOnda(x, z) {
  ONDA.uInicioOnda.value = ONDA.uTiempo.value;
  ONDA.uOrigenOnda.value.set(x, z);
}
