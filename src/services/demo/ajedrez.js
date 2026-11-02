// Motor de ajedrez mínimo para el modo demo.
//
// Reproduce las reglas que expone el backend (chess-core): movimientos legales,
// enroque, captura al paso, promoción, jaque, jaque mate, rey ahogado, material
// insuficiente, triple repetición y regla de los 50 movimientos.
//
// La notación es la misma que usa la API: coordenadas ("e2e4", "e7e8q").

export const FEN_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const ARCHIVOS = 'abcdefgh';
const TIPOS = new Set(['p', 'n', 'b', 'r', 'q', 'k']);

const SALTOS_CABALLO = [
  [1, 2], [2, 1], [-1, 2], [-2, 1],
  [1, -2], [2, -1], [-1, -2], [-2, -1],
];
const DIRECCIONES_REY = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const DIRECCIONES_TORRE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRECCIONES_ALFIL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function indiceDeCasilla(casilla) {
  if (typeof casilla !== 'string' || casilla.length !== 2) return -1;
  const columna = ARCHIVOS.indexOf(casilla[0]);
  const fila = Number(casilla[1]) - 1;
  if (columna < 0 || !Number.isInteger(fila) || fila < 0 || fila > 7) return -1;
  return fila * 8 + columna;
}

export function casillaDeIndice(indice) {
  return ARCHIVOS[indice % 8] + (Math.floor(indice / 8) + 1);
}

function colorDe(pieza) {
  return pieza === pieza.toUpperCase() ? 'w' : 'b';
}

function tipoDe(pieza) {
  return pieza.toLowerCase();
}

function contrario(color) {
  return color === 'w' ? 'b' : 'w';
}

function dentro(fila, columna) {
  return fila >= 0 && fila < 8 && columna >= 0 && columna < 8;
}

function esPropia(pieza, color) {
  return Boolean(pieza) && colorDe(pieza) === color;
}

function clavePosicion(estado) {
  const tablero = estado.board.map((pieza) => pieza ?? '.').join('');
  const enroques = [
    estado.enroques.K ? 'K' : '',
    estado.enroques.Q ? 'Q' : '',
    estado.enroques.k ? 'k' : '',
    estado.enroques.q ? 'q' : '',
  ].join('') || '-';
  const alPaso = estado.alPaso == null ? '-' : casillaDeIndice(estado.alPaso);
  return `${tablero} ${estado.turno} ${enroques} ${alPaso}`;
}

export function desdeFen(fen = FEN_INICIAL) {
  const partes = String(fen).trim().split(/\s+/);
  const colocacion = partes[0];
  const turno = partes[1] === 'b' ? 'b' : 'w';
  const enroquesTexto = partes[2] ?? '-';
  const alPasoTexto = partes[3] ?? '-';
  const halfmove = Number(partes[4] ?? 0) || 0;
  const fullmove = Number(partes[5] ?? 1) || 1;

  const filas = colocacion.split('/');
  if (filas.length !== 8) throw new Error('FEN inválido: se esperaban 8 filas');

  const board = new Array(64).fill(null);
  filas.forEach((fila, indice) => {
    const rank = 7 - indice;
    let file = 0;
    for (const simbolo of fila) {
      if (/^[1-8]$/.test(simbolo)) {
        file += Number(simbolo);
        continue;
      }
      if (!TIPOS.has(simbolo.toLowerCase()) || file > 7) {
        throw new Error('FEN inválido: colocación incorrecta');
      }
      board[rank * 8 + file] = simbolo;
      file += 1;
    }
    if (file !== 8) throw new Error('FEN inválido: fila incompleta');
  });

  const estado = {
    board,
    turno,
    enroques: {
      K: enroquesTexto.includes('K'),
      Q: enroquesTexto.includes('Q'),
      k: enroquesTexto.includes('k'),
      q: enroquesTexto.includes('q'),
    },
    alPaso: alPasoTexto === '-' ? null : indiceDeCasilla(alPasoTexto),
    halfmove,
    fullmove,
    historial: [],
  };
  estado.historial.push(clavePosicion(estado));
  return estado;
}

export function aFen(estado) {
  const filas = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let fila = '';
    let vacias = 0;
    for (let file = 0; file < 8; file += 1) {
      const pieza = estado.board[rank * 8 + file];
      if (pieza) {
        if (vacias) { fila += vacias; vacias = 0; }
        fila += pieza;
      } else {
        vacias += 1;
      }
    }
    if (vacias) fila += vacias;
    filas.push(fila);
  }
  const enroques = [
    estado.enroques.K ? 'K' : '',
    estado.enroques.Q ? 'Q' : '',
    estado.enroques.k ? 'k' : '',
    estado.enroques.q ? 'q' : '',
  ].join('') || '-';
  const alPaso = estado.alPaso == null ? '-' : casillaDeIndice(estado.alPaso);
  return `${filas.join('/')} ${estado.turno} ${enroques} ${alPaso} ${estado.halfmove} ${estado.fullmove}`;
}

function clonar(estado) {
  return {
    board: estado.board.slice(),
    turno: estado.turno,
    enroques: { ...estado.enroques },
    alPaso: estado.alPaso,
    halfmove: estado.halfmove,
    fullmove: estado.fullmove,
    historial: estado.historial.slice(),
  };
}

function buscarRey(board, color) {
  const rey = color === 'w' ? 'K' : 'k';
  return board.indexOf(rey);
}

export function estaEnJaque(estado) {
  const rey = buscarRey(estado.board, estado.turno);
  if (rey < 0) return false;
  return esCasillaAtacada(estado.board, rey, contrario(estado.turno));
}

function esCasillaAtacada(board, casilla, porColor) {
  const fila = Math.floor(casilla / 8);
  const columna = casilla % 8;

  // Peones: un peón ataca una fila por delante de su posición.
  const filaPeon = fila + (porColor === 'w' ? -1 : 1);
  for (const dc of [-1, 1]) {
    if (dentro(filaPeon, columna + dc)) {
      const pieza = board[filaPeon * 8 + columna + dc];
      if (pieza && colorDe(pieza) === porColor && tipoDe(pieza) === 'p') return true;
    }
  }

  // Caballos.
  for (const [df, dc] of SALTOS_CABALLO) {
    if (dentro(fila + df, columna + dc)) {
      const pieza = board[(fila + df) * 8 + columna + dc];
      if (pieza && colorDe(pieza) === porColor && tipoDe(pieza) === 'n') return true;
    }
  }

  // Rey.
  for (const [df, dc] of DIRECCIONES_REY) {
    if (dentro(fila + df, columna + dc)) {
      const pieza = board[(fila + df) * 8 + columna + dc];
      if (pieza && colorDe(pieza) === porColor && tipoDe(pieza) === 'k') return true;
    }
  }

  // Deslizantes: torre/dama en rectas, alfil/dama en diagonales.
  for (const [df, dc, tipos] of [
    [1, 0, 'rq'], [-1, 0, 'rq'], [0, 1, 'rq'], [0, -1, 'rq'],
    [1, 1, 'bq'], [1, -1, 'bq'], [-1, 1, 'bq'], [-1, -1, 'bq'],
  ]) {
    let f = fila + df;
    let c = columna + dc;
    while (dentro(f, c)) {
      const pieza = board[f * 8 + c];
      if (pieza) {
        if (colorDe(pieza) === porColor && tipos.includes(tipoDe(pieza))) return true;
        break;
      }
      f += df;
      c += dc;
    }
  }

  return false;
}

function agregarMovimientoPeon(movimientos, estado, desde, hasta, color, captura, alPasoCaptura) {
  const filaDestino = Math.floor(hasta / 8);
  const esPromocion = color === 'w' ? filaDestino === 7 : filaDestino === 0;
  const pieza = estado.board[desde];
  if (esPromocion) {
    for (const promocion of ['q', 'r', 'b', 'n']) {
      movimientos.push({
        desde, hasta, pieza, captura, promocion, enroque: null, alPasoCaptura: alPasoCaptura ?? null,
      });
    }
  } else {
    movimientos.push({
      desde, hasta, pieza, captura, promocion: null, enroque: null, alPasoCaptura: alPasoCaptura ?? null,
    });
  }
}

function movimientosPeon(movimientos, estado, desde, color) {
  const fila = Math.floor(desde / 8);
  const columna = desde % 8;
  const direccion = color === 'w' ? 1 : -1;
  const filaDestino = fila + direccion;

  if (!dentro(filaDestino, columna)) return;

  const adelante = filaDestino * 8 + columna;
  if (!estado.board[adelante]) {
    agregarMovimientoPeon(movimientos, estado, desde, adelante, color, null, null);
    const filaInicial = color === 'w' ? 1 : 6;
    if (fila === filaInicial) {
      const dosAdelante = (fila + 2 * direccion) * 8 + columna;
      if (!estado.board[dosAdelante]) {
        movimientos.push({
          desde, hasta: dosAdelante, pieza: estado.board[desde], captura: null,
          promocion: null, enroque: null, alPasoCaptura: null,
        });
      }
    }
  }

  for (const dc of [-1, 1]) {
    const destinoColumna = columna + dc;
    if (!dentro(filaDestino, destinoColumna)) continue;
    const destino = filaDestino * 8 + destinoColumna;
    const objetivo = estado.board[destino];
    if (objetivo && colorDe(objetivo) !== color) {
      agregarMovimientoPeon(movimientos, estado, desde, destino, color, objetivo, null);
    } else if (!objetivo && estado.alPaso === destino) {
      const capturada = destino - direccion * 8;
      const piezaCapturada = estado.board[capturada];
      if (piezaCapturada && tipoDe(piezaCapturada) === 'p' && colorDe(piezaCapturada) !== color) {
        agregarMovimientoPeon(movimientos, estado, desde, destino, color, piezaCapturada, capturada);
      }
    }
  }
}

function movimientosDeslizantes(movimientos, estado, desde, color, direcciones) {
  const fila = Math.floor(desde / 8);
  const columna = desde % 8;
  const pieza = estado.board[desde];
  for (const [df, dc] of direcciones) {
    let f = fila + df;
    let c = columna + dc;
    while (dentro(f, c)) {
      const destino = f * 8 + c;
      const objetivo = estado.board[destino];
      if (!objetivo) {
        movimientos.push({
          desde, hasta: destino, pieza, captura: null, promocion: null, enroque: null, alPasoCaptura: null,
        });
      } else {
        if (colorDe(objetivo) !== color) {
          movimientos.push({
            desde, hasta: destino, pieza, captura: objetivo, promocion: null, enroque: null, alPasoCaptura: null,
          });
        }
        break;
      }
      f += df;
      c += dc;
    }
  }
}

function movimientosSaltadores(movimientos, estado, desde, color, saltos) {
  const fila = Math.floor(desde / 8);
  const columna = desde % 8;
  const pieza = estado.board[desde];
  for (const [df, dc] of saltos) {
    if (!dentro(fila + df, columna + dc)) continue;
    const destino = (fila + df) * 8 + columna + dc;
    const objetivo = estado.board[destino];
    if (!objetivo || colorDe(objetivo) !== color) {
      movimientos.push({
        desde, hasta: destino, pieza, captura: objetivo ?? null, promocion: null, enroque: null, alPasoCaptura: null,
      });
    }
  }
}

function movimientosEnroque(movimientos, estado, desde, color) {
  const board = estado.board;
  const fila = color === 'w' ? 0 : 7;
  const rey = color === 'w' ? 'K' : 'k';
  const torre = color === 'w' ? 'R' : 'r';
  const enemigo = contrario(color);
  const casillaRey = fila * 8 + 4;

  if (desde !== casillaRey || board[desde] !== rey) return;
  if (esCasillaAtacada(board, casillaRey, enemigo)) return;

  const corto = color === 'w' ? estado.enroques.K : estado.enroques.k;
  if (corto) {
    const f = fila * 8 + 5;
    const g = fila * 8 + 6;
    const h = fila * 8 + 7;
    if (!board[f] && !board[g] && board[h] === torre
      && !esCasillaAtacada(board, f, enemigo) && !esCasillaAtacada(board, g, enemigo)) {
      movimientos.push({
        desde, hasta: g, pieza: rey, captura: null, promocion: null,
        enroque: 'K', torreDesde: h, torreHasta: f, alPasoCaptura: null,
      });
    }
  }

  const largo = color === 'w' ? estado.enroques.Q : estado.enroques.q;
  if (largo) {
    const d = fila * 8 + 3;
    const c = fila * 8 + 2;
    const b = fila * 8 + 1;
    const a = fila * 8 + 0;
    if (!board[d] && !board[c] && !board[b] && board[a] === torre
      && !esCasillaAtacada(board, d, enemigo) && !esCasillaAtacada(board, c, enemigo)) {
      movimientos.push({
        desde, hasta: c, pieza: rey, captura: null, promocion: null,
        enroque: 'Q', torreDesde: a, torreHasta: d, alPasoCaptura: null,
      });
    }
  }
}

function movimientosPseudoLegales(estado, color = estado.turno) {
  const movimientos = [];
  for (let desde = 0; desde < 64; desde += 1) {
    const pieza = estado.board[desde];
    if (!pieza || colorDe(pieza) !== color) continue;
    switch (tipoDe(pieza)) {
      case 'p': movimientosPeon(movimientos, estado, desde, color); break;
      case 'n': movimientosSaltadores(movimientos, estado, desde, color, SALTOS_CABALLO); break;
      case 'b': movimientosDeslizantes(movimientos, estado, desde, color, DIRECCIONES_ALFIL); break;
      case 'r': movimientosDeslizantes(movimientos, estado, desde, color, DIRECCIONES_TORRE); break;
      case 'q':
        movimientosDeslizantes(movimientos, estado, desde, color, DIRECCIONES_TORRE);
        movimientosDeslizantes(movimientos, estado, desde, color, DIRECCIONES_ALFIL);
        break;
      case 'k':
        movimientosSaltadores(movimientos, estado, desde, color, DIRECCIONES_REY);
        movimientosEnroque(movimientos, estado, desde, color);
        break;
      default: break;
    }
  }
  return movimientos;
}

export function aplicarMovimiento(estado, movimiento) {
  const nuevo = clonar(estado);
  const color = colorDe(movimiento.pieza);

  if (movimiento.alPasoCaptura != null) nuevo.board[movimiento.alPasoCaptura] = null;

  nuevo.board[movimiento.desde] = null;
  if (movimiento.enroque) {
    nuevo.board[movimiento.hasta] = color === 'w' ? 'K' : 'k';
    nuevo.board[movimiento.torreDesde] = null;
    nuevo.board[movimiento.torreHasta] = color === 'w' ? 'R' : 'r';
  } else if (movimiento.promocion) {
    nuevo.board[movimiento.hasta] = color === 'w'
      ? movimiento.promocion.toUpperCase()
      : movimiento.promocion.toLowerCase();
  } else {
    nuevo.board[movimiento.hasta] = movimiento.pieza;
  }

  // Derechos de enroque.
  if (tipoDe(movimiento.pieza) === 'k') {
    if (color === 'w') { nuevo.enroques.K = false; nuevo.enroques.Q = false; }
    else { nuevo.enroques.k = false; nuevo.enroques.q = false; }
  }
  if (tipoDe(movimiento.pieza) === 'r') {
    if (movimiento.desde === 0) nuevo.enroques.Q = false;
    if (movimiento.desde === 7) nuevo.enroques.K = false;
    if (movimiento.desde === 56) nuevo.enroques.q = false;
    if (movimiento.desde === 63) nuevo.enroques.k = false;
  }
  if (movimiento.captura && tipoDe(movimiento.captura) === 'r') {
    if (movimiento.hasta === 0) nuevo.enroques.Q = false;
    if (movimiento.hasta === 7) nuevo.enroques.K = false;
    if (movimiento.hasta === 56) nuevo.enroques.q = false;
    if (movimiento.hasta === 63) nuevo.enroques.k = false;
  }

  // Casilla de captura al paso.
  nuevo.alPaso = null;
  if (tipoDe(movimiento.pieza) === 'p' && Math.abs(movimiento.hasta - movimiento.desde) === 16) {
    nuevo.alPaso = (movimiento.desde + movimiento.hasta) / 2;
  }

  const esCaptura = Boolean(movimiento.captura) || movimiento.alPasoCaptura != null;
  nuevo.halfmove = (tipoDe(movimiento.pieza) === 'p' || esCaptura) ? 0 : estado.halfmove + 1;
  nuevo.fullmove = estado.fullmove + (color === 'b' ? 1 : 0);
  nuevo.turno = contrario(color);
  nuevo.historial.push(clavePosicion(nuevo));
  return nuevo;
}

function esLegal(estado, movimiento) {
  const siguiente = aplicarMovimiento(estado, movimiento);
  const rey = buscarRey(siguiente.board, estado.turno);
  if (rey < 0) return true;
  return !esCasillaAtacada(siguiente.board, rey, contrario(estado.turno));
}

export function movimientosLegales(estado, desde = null) {
  const tieneOrigen = desde !== null && desde !== undefined && desde !== '';
  const legales = movimientosPseudoLegales(estado).filter((movimiento) => esLegal(estado, movimiento));
  if (!tieneOrigen) return legales;
  const origen = typeof desde === 'string' ? indiceDeCasilla(desde) : desde;
  if (origen < 0) return [];
  return legales.filter((movimiento) => movimiento.desde === origen);
}

export function notacionDe(movimiento) {
  return casillaDeIndice(movimiento.desde)
    + casillaDeIndice(movimiento.hasta)
    + (movimiento.promocion ?? '');
}

export function buscarMovimiento(estado, desde, hasta, promocion) {
  const origen = indiceDeCasilla(desde);
  const destino = indiceDeCasilla(hasta);
  if (origen < 0) throw new Error(`La casilla ${desde} no existe`);
  if (destino < 0) throw new Error(`La casilla ${hasta} no existe`);

  const candidatos = movimientosLegales(estado).filter(
    (movimiento) => movimiento.desde === origen && movimiento.hasta === destino,
  );

  if (candidatos.length === 0) {
    throw new Error(`Movimiento no permitido: ${desde}${hasta}${promocion ?? ''}`);
  }

  if (promocion) {
    const letra = String(promocion).toLowerCase();
    const elegido = candidatos.find((movimiento) => movimiento.promocion === letra);
    if (!elegido) throw new Error(`No se puede promocionar a '${promocion}' en ese movimiento`);
    return elegido;
  }

  if (candidatos.length === 1) return candidatos[0];

  throw new Error(`Indicá la pieza de promoción (por ejemplo: ${desde}${hasta}q)`);
}

export function jugarMovimiento(estado, desde, hasta, promocion) {
  const movimiento = buscarMovimiento(estado, desde, hasta, promocion);
  return { estado: aplicarMovimiento(estado, movimiento), movimiento };
}

function materialInsuficiente(estado) {
  let soloReyes = true;
  for (const pieza of estado.board) {
    if (!pieza) continue;
    const tipo = tipoDe(pieza);
    if (tipo !== 'k') { soloReyes = false; break; }
  }
  return soloReyes;
}

function repeticionTriple(estado) {
  const clave = clavePosicion(estado);
  let apariciones = 0;
  for (const anterior of estado.historial) {
    if (anterior === clave) apariciones += 1;
  }
  return apariciones >= 3;
}

export function estadoPartida(estado) {
  const enJaque = estaEnJaque(estado);
  const legales = movimientosLegales(estado);

  if (legales.length === 0) {
    if (enJaque) {
      return {
        enJaque,
        finalizada: true,
        resultado: estado.turno === 'w' ? 'Ganan negras: Jaque mate' : 'Ganan blancas: Jaque mate',
      };
    }
    return { enJaque, finalizada: true, resultado: 'Tablas: Rey ahogado (tablas)' };
  }

  if (materialInsuficiente(estado)) {
    return { enJaque, finalizada: true, resultado: 'Tablas: Material insuficiente' };
  }
  if (repeticionTriple(estado)) {
    return { enJaque, finalizada: true, resultado: 'Tablas: Triple repetición' };
  }
  if (estado.halfmove >= 100) {
    return { enJaque, finalizada: true, resultado: 'Tablas: Regla de los 50 movimientos' };
  }

  return { enJaque, finalizada: false, resultado: null };
}
