import { configureStore } from '@reduxjs/toolkit';
import partida from './partidaSlice.js';

export default configureStore({
  reducer: { partida },
});
