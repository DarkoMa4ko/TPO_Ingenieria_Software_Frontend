import { configureStore } from '@reduxjs/toolkit';
import partida from './partidaSlice.js';
import ajustes from './ajustesSlice.js';

export default configureStore({
  reducer: { partida, ajustes },
});
