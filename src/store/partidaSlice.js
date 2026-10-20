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
  turno: 'w',
  enJaque: false,
  finalizada: false,
  resultado: null,
  jugadores: null,
  //Guarda quién se rinde y quién gana
  rendicionInfo: null,
  jugadas: [],
  legales: [],
  seleccion: null,
  cargando: false,
  error: null,
  promoverDe: null,
  perspectiva: 'blancas',
};

function aplicarPartida(state, detalle) {
  Object.assign(state, crearEstado(detalle.estado), {
    jugadas: detalle.jugadas,
    legales: detalle.legales,
    seleccion: null,
    promoverDe: null,
  });
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
      state.perspectiva = PERSPECTIVAS[payload] ? payload : state.perspectiva;
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
        state.jugadores = { blanco: meta.arg.blanco, negro: meta.arg.negro };
        state.rendicionInfo = null;
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
      .addCase(rendirse.pending, (state) => {marcarCargando(state);
      //Se rinde el jugador al que le toca mover
      const seRindeBlancas = state.turno === 'w';

      state.rendicionInfo = {perdedor: seRindeBlancas ? state.jugadores?.blanco : state.jugadores?.negro,
        ganador: seRindeBlancas ? state.jugadores?.negro : state.jugadores?.blanco
      };
      })

      .addCase(rendirse.fulfilled, (state, { payload }) => {
        state.cargando = false;
        Object.assign(state, crearEstado(payload), { legales: [], seleccion: null });
      })
      .addCase(rendirse.rejected, (state, action) => {registrarError(state,action); state.rendicionInfo = null; });
  },
});

export const { seleccionar, deseleccionar, setearPromocion, cancelarPromocion, cambiarPerspectiva } = slice.actions;
export default slice.reducer;
