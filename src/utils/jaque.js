// Comprueba si el rey del bando al que le toca mover está atacado.
// Se utiliza como respaldo a `enJaque` recibido del backend.
export function hayJaqueEnFen(fen) {
  if (!fen || typeof fen !== 'string') return false;
  const [posicion, turno] = fen.trim().split(/\s+/);
  if (!posicion || !['w', 'b'].includes(turno)) return false;
  const filas = posicion.split('/');
  if (filas.length !== 8) return false;
  const tablero = filas.map(fila => {
    const casillas = [];
    for (const simbolo of fila) {
      if (/^[1-8]$/.test(simbolo)) casillas.push(...Array(Number(simbolo)).fill(null));
      else casillas.push(simbolo);
    }
    return casillas;
  });
  if (tablero.some(fila => fila.length !== 8)) return false;
  const rey = turno === 'w' ? 'K' : 'k';
  const rivalEsBlanco = turno === 'b';
  let reyFila = -1, reyCol = -1;
  for (let fila = 0; fila < 8; fila++) for (let col = 0; col < 8; col++) {
    if (tablero[fila][col] === rey) { reyFila = fila; reyCol = col; }
  }
  if (reyFila < 0) return false;
  const dentro = (f, c) => f >= 0 && f < 8 && c >= 0 && c < 8;
  const piezaRival = (f, c, letra) => dentro(f, c) && tablero[f][c] === (rivalEsBlanco ? letra.toUpperCase() : letra);
  // Peones atacan en diagonal hacia adelante respecto a su propio bando.
  const filaPeon = reyFila + (rivalEsBlanco ? 1 : -1);
  if (piezaRival(filaPeon, reyCol - 1, 'p') || piezaRival(filaPeon, reyCol + 1, 'p')) return true;
  for (const [df, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    if (piezaRival(reyFila + df, reyCol + dc, 'n')) return true;
  }
  for (let df = -1; df <= 1; df++) for (let dc = -1; dc <= 1; dc++) {
    if ((df || dc) && piezaRival(reyFila + df, reyCol + dc, 'k')) return true;
  }
  for (const [df, dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let f = reyFila + df, c = reyCol + dc;
    while (dentro(f, c)) {
      const pieza = tablero[f][c];
      if (pieza) {
        const letra = pieza.toLowerCase();
        const esRival = (pieza === pieza.toUpperCase()) === rivalEsBlanco;
        if (esRival && (letra === 'q' || ((df === 0 || dc === 0) ? letra === 'r' : letra === 'b'))) return true;
        break;
      }
      f += df; c += dc;
    }
  }
  return false;
}

// Devuelve la casilla del rey amenazado, para resaltarla en el tablero 3D.
// Se usa el mismo turno indicado por FEN que en hayJaqueEnFen.
export function casillaReyEnJaque(fen, enJaqueBackend = false) {
  if (!fen || (!enJaqueBackend && !hayJaqueEnFen(fen))) return null;
  const [posicion, turno] = fen.trim().split(/\s+/);
  if (!['w', 'b'].includes(turno)) return null;
  const rey = turno === 'w' ? 'K' : 'k';
  const filas = posicion.split('/');
  if (filas.length !== 8) return null;
  for (let i = 0; i < 8; i++) {
    let columna = 0;
    for (const simbolo of filas[i]) {
      if (/^[1-8]$/.test(simbolo)) columna += Number(simbolo);
      else {
        if (simbolo === rey && columna < 8) return 'abcdefgh'[columna] + (8 - i);
        columna++;
      }
    }
  }
  return null;
}
