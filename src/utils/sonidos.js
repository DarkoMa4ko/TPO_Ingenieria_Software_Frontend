let contexto;
export function reproducirSonido(tipo) {
  if (localStorage.getItem('ajedrez-sonido') === 'off') return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    contexto ??= new AudioContext();
    if (contexto.state === 'suspended') contexto.resume();
    const patrones = {
      mover: [[480, .075], [360, .07]],
      captura: [[220, .095], [150, .11]],
      jaque: [[740, .10], [880, .16]],
      jaqueMate: [[784, .15], [622, .15], [466, .18], [349, .36]],
      final: [[440, .13], [554, .13], [659, .24]],
      tablas: [[400, .14], [340, .2]],
    };
    let inicio = contexto.currentTime;
    for (const [frecuencia, duracion] of (patrones[tipo] || patrones.mover)) {
      const oscilador = contexto.createOscillator();
      const volumen = contexto.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.value = frecuencia;
      volumen.gain.setValueAtTime(.0001, inicio);
      volumen.gain.exponentialRampToValueAtTime(.085, inicio + .012);
      volumen.gain.exponentialRampToValueAtTime(.0001, inicio + duracion);
      oscilador.connect(volumen).connect(contexto.destination);
      oscilador.start(inicio);
      oscilador.stop(inicio + duracion + .01);
      inicio += duracion;
    }
  } catch { /* El sonido nunca debe impedir una jugada. */ }
}
