import { parseFen } from './fen.js';

export const FEN_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function mapaDeFen(fen) {
  if (!fen) return new Map();
  return new Map(parseFen(fen).map((pieza) => [pieza.casilla, pieza]));
}

function capturadaEnJugada(anterior, jugada) {
  const movida = anterior.get(jugada.desde);
  if (!movida) return null;

  const destino = anterior.get(jugada.hasta);
  if (destino && destino.blanco !== movida.blanco) {
    return { tipo: destino.tipo, blanco: destino.blanco, casilla: destino.casilla };
  }

  // Captura al paso: el peón capturado no está en el destino sino al costado.
  if (movida.tipo === 'p' && !destino && jugada.desde[0] !== jugada.hasta[0]) {
    const casilla = jugada.hasta[0] + jugada.desde[1];
    const peon = anterior.get(casilla);
    if (peon && peon.tipo === 'p' && peon.blanco !== movida.blanco) {
      return { tipo: peon.tipo, blanco: peon.blanco, casilla: peon.casilla };
    }
  }

  return null;
}

export function capturasDeJugadas(jugadas, fenInicial = FEN_INICIAL) {
  let anterior = mapaDeFen(fenInicial);
  const capturas = [];
  let orden = 0;

  for (const jugada of jugadas) {
    const capturada = capturadaEnJugada(anterior, jugada);
    if (capturada) capturas.push({ ...capturada, orden: orden++ });
    anterior = mapaDeFen(jugada.fen);
  }

  return capturas;
}

export function capturaDeJugada(fenAnterior, jugada) {
  return capturadaEnJugada(mapaDeFen(fenAnterior), jugada);
}

export function movimientosDeJugada(fenAnterior, jugada) {
  const anterior = mapaDeFen(fenAnterior);
  const movida = anterior.get(jugada.desde);
  if (!movida) return [];

  const movimientos = [{
    tipo: movida.tipo,
    blanco: movida.blanco,
    desde: jugada.desde,
    hasta: jugada.hasta,
  }];

  // Enroque: el rey se mueve dos columnas y la torre lo acompaña.
  if (movida.tipo === 'k' && Math.abs(jugada.desde.charCodeAt(0) - jugada.hasta.charCodeAt(0)) === 2) {
    const fila = jugada.desde[1];
    const corto = jugada.hasta[0] > jugada.desde[0];
    const torreDesde = (corto ? 'h' : 'a') + fila;
    const torreHasta = (corto ? 'f' : 'd') + fila;
    const torre = anterior.get(torreDesde);
    if (torre && torre.tipo === 'r') {
      movimientos.push({ tipo: 'r', blanco: torre.blanco, desde: torreDesde, hasta: torreHasta });
    }
  }

  return movimientos;
}
