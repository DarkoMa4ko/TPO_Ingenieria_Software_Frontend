const COLUMNAS = 'abcdefgh';

export function parseFen(fen) {
  const [tablero, lado] = fen.split(' ');
  const piezas = [];
  tablero.split('/').forEach((fila, indice) => {
    const rank = 7 - indice;
    let file = 0;
    for (const caracter of fila) {
      if (/[1-8]/.test(caracter)) {
        file += Number(caracter);
        continue;
      }
      piezas.push({
        id: `${COLUMNAS[file]}${rank + 1}`,
        tipo: caracter.toLowerCase(),
        blanco: caracter === caracter.toUpperCase(),
        casilla: COLUMNAS[file] + (rank + 1),
        file,
        rank,
      });
      file += 1;
    }
  });
  return piezas;
}

export function casillaOffset(casilla) {
  return { x: COLUMNAS.indexOf(casilla[0]) - 3.5, z: 3.5 - (Number(casilla[1]) - 1) };
}

export function casillaDeCoords(x, z) {
  const file = Math.round(x + 3.5);
  const rank = 7 - Math.round(3.5 - z);
  return COLUMNAS[file] + (rank + 1);
}
