import { parseFen } from './fen.js';
import { hayJaqueEnFen } from './jaque.js';
import { FEN_INICIAL } from './capturas.js';

export const esTablas = (resultado) => /tabla|empate|ahogado|stalemate|draw/i.test(resultado || '');
export const esMate = (resultado) => /jaque[\s-]*mate|checkmate|\bmate\b/i.test(resultado || '');

// 'w' | 'b' | null según quién ganó, deducido del texto o de quién debía mover.
export function ganador(resultado, turno) {
  if (esTablas(resultado)) return null;
  if (/ganan?\s+(las\s+)?blancas/i.test(resultado || '')) return 'w';
  if (/ganan?\s+(las\s+)?negras/i.test(resultado || '')) return 'b';
  return turno === 'w' ? 'b' : 'w';
}

const GLIFOS = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '' },
};
export const VALORES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const glifo = (tipo, blanco) => (GLIFOS[blanco ? 'w' : 'b'][tipo] || (blanco ? '♙' : '♟'));

// Notación algebraica con figuras a partir de la jugada y las posiciones.
export function notacionFigurada(jugadas, fenInicial = FEN_INICIAL, mate = false) {
  let anterior = fenInicial;
  return jugadas.map((jugada, indice) => {
    const mapa = new Map(parseFen(anterior).map((p) => [p.casilla, p]));
    const pieza = mapa.get(jugada.desde);
    const destino = mapa.get(jugada.hasta);
    let texto;
    if (!pieza) {
      texto = jugada.notacion;
    } else if (pieza.tipo === 'k' && Math.abs(jugada.desde.charCodeAt(0) - jugada.hasta.charCodeAt(0)) === 2) {
      texto = jugada.hasta[0] === 'g' ? 'O-O' : 'O-O-O';
    } else {
      const captura = Boolean(destino) || (pieza.tipo === 'p' && jugada.desde[0] !== jugada.hasta[0]);
      const prefijo = pieza.tipo === 'p' ? (captura ? jugada.desde[0] : '') : glifo(pieza.tipo, pieza.blanco);
      const promocion = jugada.notacion?.length > 4 ? `=${glifo(jugada.notacion[4].toLowerCase(), pieza.blanco)}` : '';
      texto = `${prefijo}${captura ? '×' : ''}${jugada.hasta}${promocion}`;
    }
    if (mate && indice === jugadas.length - 1) texto += '#';
    else if (jugada.fen && hayJaqueEnFen(jugada.fen)) texto += '+';
    anterior = jugada.fen || anterior;
    return { ...jugada, texto, blanco: pieza ? pieza.blanco : true };
  });
}
