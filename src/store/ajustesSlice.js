import { createSlice } from '@reduxjs/toolkit';

// Opciones visuales elegibles desde Ajustes. Se guardan en este navegador.
export const OPCIONES = {
  tablero: [
    { valor: 'oscuro', etiqueta: 'Obsidiana', detalle: 'Negro y grafito con acero' },
    { valor: 'clasico', etiqueta: 'Clásico', detalle: 'Arce y nogal con latón' },
    { valor: 'luz', etiqueta: 'Luz y vidrio', detalle: 'Vidrio negro y casillas de luz' },
  ],
  mesa: [
    { valor: 'hielo', etiqueta: 'LED hielo', detalle: 'Espejo infinito, luz fría' },
    { valor: 'violeta', etiqueta: 'LED violeta', detalle: 'Espejo infinito, neón' },
    { valor: 'ladrillo', etiqueta: 'Jardín', detalle: 'Pozo de ladrillo con hiedra, flores y bombillas' },
    { valor: 'piedra', etiqueta: 'Básico', detalle: 'Mesa lisa, sin espejo' },
  ],
};

const PREDETERMINADOS = { tablero: 'oscuro', mesa: 'hielo', cinematicaCaptura: true, efectosCaptura: true };
const CLAVE = 'ajedrez-ajustes';

// Interruptores (encendido/apagado): no son opciones de una lista, son banderas
// booleanas que vale con alternar. Cinemática de captura y efectos de captura.
const INTERRUPTORES = ['cinematicaCaptura', 'efectosCaptura'];

function leer() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    // El jardín de antes ya no existe: el nuevo es el pozo de ladrillo.
    if (guardado.mesa === 'jardin') guardado.mesa = 'ladrillo';
    const valido = Object.fromEntries(
      Object.entries(guardado).filter(([k, v]) =>
        INTERRUPTORES.includes(k) ? typeof v === 'boolean' : OPCIONES[k]?.some((o) => o.valor === v)),
    );
    return { ...PREDETERMINADOS, ...valido };
  } catch {
    return { ...PREDETERMINADOS };
  }
}

const slice = createSlice({
  name: 'ajustes',
  initialState: leer,
  reducers: {
    cambiarAjuste(state, { payload: { clave, valor } }) {
      if (!OPCIONES[clave]?.some((o) => o.valor === valor)) return;
      state[clave] = valor;
      try {
        localStorage.setItem(CLAVE, JSON.stringify({ ...state }));
      } catch { /* sin almacenamiento: vale sólo para esta sesión */ }
    },
    // Interruptores (con interruptora true/false): apagar o prender la cinemática
    // y los efectos de captura.
    alternarAjuste(state, { payload: clave }) {
      if (!INTERRUPTORES.includes(clave)) return;
      state[clave] = !state[clave];
      try {
        localStorage.setItem(CLAVE, JSON.stringify({ ...state }));
      } catch { /* sin almacenamiento: vale sólo para esta sesión */ }
    },
  },
});

export const { cambiarAjuste, alternarAjuste } = slice.actions;
export default slice.reducer;
