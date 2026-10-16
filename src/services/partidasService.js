import apiClient from './apiClient.js';

export function crearPartida(jugadorBlanco, jugadorNegro) {
  return apiClient.post('/api/partidas', { jugadorBlanco, jugadorNegro });
}

export function jugar(id, desde, hasta, promocion) {
  return apiClient.post(`/api/partidas/${id}/movimientos`, { desde, hasta, promocion });
}

export function estado(id) {
  return apiClient.get(`/api/partidas/${id}`);
}

export function jugadasLegales(id, casilla = null) {
  return apiClient.get(`/api/partidas/${id}/jugadas`, { params: casilla ? { casilla } : {} });
}

export function finalizarPartida(id, motivo) {
  return apiClient.put(`/api/partidas/${id}/finalizar`, { motivo });
}

export function mensajeDeError(axiosError) {
  return axiosError?.response?.data?.mensaje ?? 'No se pudo conectar con el servidor';
}
