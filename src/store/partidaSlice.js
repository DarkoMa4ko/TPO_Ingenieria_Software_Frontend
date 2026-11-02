import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as api from '../services/partidasService.js';
import { PERSPECTIVAS } from '../ui/perspectivas.js';

const crearEstado = (estado) => ({
  id: estado.id,
  fen: estado.fen,
  turno: estado.turno,
  enJaque: estado.enJaque,
  finalizada: estado.finalizada,
  resultado: estado.resultado,
});

const cargarDetalle = async (id) => {
  const [detalle, legales] = await Promise.all([api.estado(id), api.jugadasLegales(id)]);
  return { estado: detalle.data.estado, jugadas: detalle.data.jugadas, legales: legales.data.jugadas };
};

export const crearPartida = createAsyncThunk('partida/crear', async ({ blanco, negro }, { rejectWithValue }) => {
  try {
    const { data } = await api.crearPartida(blanco || null, negro || null);
    return await cargarDetalle(data.id);
  } catch (error) {
    return rejectWithValue(api.mensajeDeError(error));
  }
});

export const jugar = createAsyncThunk('partida/jugar', async ({ id, desde, hasta, promocion }, { rejectWithValue }) => {
  try {
    await api.jugar(id, desde, hasta, promocion ?? null);
    return await cargarDetalle(id);
  } catch (error) {
    return rejectWithValue(api.mensajeDeError(error));
  }
});

export const rendirse = createAsyncThunk('partida/rendirse', async (id, { rejectWithValue }) => {
  try {
    const { data } = await api.finalizarPartida(id, 'Rendición');
    return data;
  } catch (error) {
    return rejectWithValue(api.mensajeDeError(error));
  }
});

const estadoInicial = {
  id: null,
  fen: null,
  fenInicial: null,
  turno: 'w',
  enJaque: false,
  finalizada: false,
  resultado: null,
  jugadores: null,
  jugadas: [],
  legales: [],
  seleccion: null,
  cargando: false,
  error: null,
  promoverDe: null,
  perspectiva: 'blancas',  // Obliga a la cámara a re-volar aunque se elija la perspectiva que ya está activa.
  sincCamara: 0,
  // Marcador de la sesión: victorias de blancas, de negras y empates.
  marcador: { w: 0, b: 0, t: 0 },
  marcadorRegistrado: null,
  // El panel de la partida se puede ocultar (botón o tecla P) para ver la escena entera.
  panelOculto: false,
  // Lado desde el que se mira: la vista cenital lo respeta.
  lado: 'blancas',
  cinematica: null,
};

function aplicarPartida(state, detalle) {
  Object.assign(state, crearEstado(detalle.estado), {
    jugadas: detalle.jugadas,
    legales: detalle.legales,
    seleccion: null,
    promoverDe: null,
  });
  registrarPuntaje(state, detalle.estado);
}

// Suma la partida terminada al marcador de la sesión (una sola vez por partida).
function registrarPuntaje(state, estado) {
  if (!estado.finalizada || !estado.resultado) return;
  if (state.marcadorRegistrado === estado.id) return;
  state.marcadorRegistrado = estado.id;
  const r = estado.resultado;
  if (/tabla|empate|ahogado|draw|stalemate/i.test(r)) {
    state.marcador.t += 1;
    return;
  }
  // La rendición llega como "Rendición", sin nombrar al ganador: gana el
  // bando contrario al que tenía el turno (igual que `ganador()` del utils).
  let gana;
  if (/ganan?\s+(las\s+)?blancas/i.test(r)) gana = 'w';
  else if (/ganan?\s+(las\s+)?negras/i.test(r)) gana = 'b';
  else gana = estado.turno === 'w' ? 'b' : 'w';
  state.marcador[gana] += 1;
}

const slice = createSlice({
  name: 'partida',
  initialState: estadoInicial,
  reducers: {
    seleccionar(state, { payload }) {
      state.seleccion = payload;
    },
    deseleccionar(state) {
      state.seleccion = null;
    },
    setearPromocion(state, { payload }) {
      state.promoverDe = payload;
      state.seleccion = null;
    },
    cancelarPromocion(state) {
      state.promoverDe = null;
    },
    cambiarPerspectiva(state, { payload }) {
      if (!PERSPECTIVAS[payload]) return;
      state.sincCamara += 1;
      if (payload === 'blancas' || payload === 'negras') {
        // En la vista cenital, 1 y 2 sólo giran el tablero: se queda cenital.
        state.lado = payload;
        if (state.perspectiva !== 'cenital') state.perspectiva = payload;
      } else if (payload === 'cenital' && state.perspectiva === 'cenital') {
        // Volver a pulsar la cenital regresa a la vista inclinada del lado actual.
        state.perspectiva = state.lado;
      } else {
        state.perspectiva = payload;
      }
    },
    fijarCinematica(state, { payload }) {
      state.cinematica = payload;
    },
    alternarPanel(state) {
      state.panelOculto = !state.panelOculto;
    },
  },
  extraReducers: (builder) => {
    const marcarCargando = (state) => {
      state.cargando = true;
      state.error = null;
    };
    const registrarError = (state, { payload }) => {
      state.cargando = false;
      state.error = payload;
    };
    builder
      .addCase(crearPartida.pending, marcarCargando)
      .addCase(crearPartida.fulfilled, (state, { payload, meta }) => {
        state.cargando = false;
        aplicarPartida(state, payload);
        state.fenInicial = payload.estado.fen;
        state.jugadores = { blanco: meta.arg.blanco, negro: meta.arg.negro };
        state.error = null;
      })
      .addCase(crearPartida.rejected, registrarError)
      .addCase(jugar.pending, marcarCargando)
      .addCase(jugar.fulfilled, (state, { payload }) => {
        state.cargando = false;
        aplicarPartida(state, payload);
      })
      .addCase(jugar.rejected, (state, { payload, meta }) => {
        state.cargando = false;
        if (payload?.includes('promoci')) {
          state.promoverDe = { desde: meta.arg.desde, hasta: meta.arg.hasta };
          state.seleccion = null;
        } else {
          state.error = payload;
        }
      })
      .addCase(rendirse.pending, marcarCargando)
      .addCase(rendirse.fulfilled, (state, { payload }) => {
        state.cargando = false;
        Object.assign(state, crearEstado(payload), { legales: [], seleccion: null });
        state.promoverDe = null;
        registrarPuntaje(state, payload);
      })
      .addCase(rendirse.rejected, registrarError);
  },
});

export const {
  seleccionar, deseleccionar, setearPromocion, cancelarPromocion, cambiarPerspectiva, fijarCinematica, alternarPanel,
} = slice.actions;
export default slice.reducer;
