// Adaptador "demo" del servicio de partidas.
//
// Expone las mismas funciones y devuelve la misma forma de datos que la API
// (`{ data: ... }`), pero juega íntegramente en el navegador. Así el resto del
// frontend funciona igual con backend o sin él.

import {
  FEN_INICIAL,
  aFen,
  casillaDeIndice,
  desdeFen,
  estadoPartida,
  estaEnJaque,
  indiceDeCasilla,
  jugarMovimiento,
  movimientosLegales,
  notacionDe,
} from './ajedrez.js';

let siguienteId = 1;
const partidas = new Map();

function obtener(id) {
  const partida = partidas.get(Number(id));
  if (!partida) throw new Error(`No existe la partida ${id}`);
  return partida;
}

function estadoPublico(partida) {
  const posicion = partida.posicion;
  return {
    id: partida.id,
    fen: aFen(posicion),
    turno: posicion.turno,
    enJaque: estaEnJaque(posicion),
    finalizada: partida.finalizada,
    resultado: partida.resultado,
  };
}

export function crearPartida(jugadorBlanco = null, jugadorNegro = null, fen = null) {
  const fenInicial = fen && String(fen).trim() ? String(fen).trim() : FEN_INICIAL;
  const posicion = desdeFen(fenInicial);
  const info = estadoPartida(posicion);
  const id = siguienteId;

  siguienteId += 1;
  const partida = {
    id,
    jugadorBlanco: jugadorBlanco || null,
    jugadorNegro: jugadorNegro || null,
    fenInicial,
    posicion,
    jugadas: [],
    finalizada: info.finalizada,
    resultado: info.resultado,
  };
  partidas.set(id, partida);

  return Promise.resolve({ data: estadoPublico(partida) });
}

export function jugar(id, desde, hasta, promocion = null) {
  const partida = obtener(id);
  if (partida.finalizada) throw new Error(partida.resultado || 'Partida finalizada');

  const { estado: posicion, movimiento } = jugarMovimiento(partida.posicion, desde, hasta, promocion);
  const info = estadoPartida(posicion);

  partida.posicion = posicion;
  if (info.finalizada) {
    partida.finalizada = true;
    partida.resultado = info.resultado;
  }
  partida.jugadas.push({
    numero: partida.jugadas.length + 1,
    desde,
    hasta,
    notacion: notacionDe(movimiento),
    fen: aFen(posicion),
  });

  return Promise.resolve({ data: estadoPublico(partida) });
}

export function estado(id) {
  const partida = obtener(id);
  // Se devuelve una copia: Redux/Immer congela lo que recibe y el modo demo
  // necesita seguir agregando jugadas a su propio array.
  return Promise.resolve({
    data: {
      estado: estadoPublico(partida),
      jugadas: partida.jugadas.map((jugada) => ({ ...jugada })),
    },
  });
}

export function jugadasLegales(id, casilla = null) {
  const partida = obtener(id);
  if (partida.finalizada) {
    return Promise.resolve({ data: { turno: partida.posicion.turno, jugadas: [] } });
  }

  const origen = casilla ? indiceDeCasilla(casilla) : null;
  const jugadas = movimientosLegales(partida.posicion, origen)
    .map((movimiento) => ({
      desde: casillaDeIndice(movimiento.desde),
      hasta: casillaDeIndice(movimiento.hasta),
      notacion: notacionDe(movimiento),
    }))
    .sort((a, b) => (a.notacion < b.notacion ? -1 : a.notacion > b.notacion ? 1 : 0));

  return Promise.resolve({ data: { turno: partida.posicion.turno, jugadas } });
}

export function finalizarPartida(id, motivo = null) {
  const partida = obtener(id);
  if (partida.finalizada) throw new Error(partida.resultado || 'Partida finalizada');

  partida.finalizada = true;
  partida.resultado = motivo && String(motivo).trim() ? String(motivo).trim() : 'Partida abandonada';
  return Promise.resolve({ data: estadoPublico(partida) });
}
