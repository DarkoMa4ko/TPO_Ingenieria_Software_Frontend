import apiClient from './apiClient.js';
import * as demo from './demo/partidasDemo.js';

// Modo de datos:
//   VITE_DEMO=true   -> siempre local (sin backend).
//   VITE_DEMO=false  -> siempre API.
//   VITE_DEMO=auto   -> intenta API y, si el backend no responde, pasa a demo
//                       durante el resto de la sesión (predeterminado).
const MODO = String(import.meta.env.VITE_DEMO ?? 'auto').toLowerCase().trim();
const DEMO_FORZADO = ['true', '1', 'si', 'sí', 'on', 'demo', 'local'].includes(MODO);
const SOLO_API = ['false', '0', 'no', 'off', 'api', 'backend'].includes(MODO);

let usandoDemo = DEMO_FORZADO;

function activarDemo() {
  if (usandoDemo) return;
  usandoDemo = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ajedrez:modo-demo'));
  }
}

export function esModoDemo() {
  return usandoDemo;
}

function pareceBackendCaido(error) {
  const respuesta = error?.response;
  // Sin respuesta = no se pudo conectar.
  if (!respuesta) return true;
  // Errores del proxy de Vite cuando el backend no está levantado.
  if ([502, 503, 504].includes(respuesta.status)) return true;
  // Un 500 del proxy (texto plano) también indica caída; un 500 JSON puede ser
  // un error real del backend y se deja pasar.
  if (respuesta.status === 500) {
    const tipo = String(respuesta.headers?.['content-type'] ?? '');
    return !tipo.includes('application/json');
  }
  return false;
}

async function conRespaldo(real, alternativa) {
  if (usandoDemo) return alternativa();
  if (SOLO_API) return real();
  try {
    return await real();
  } catch (error) {
    if (!pareceBackendCaido(error)) throw error;
    activarDemo();
    return alternativa();
  }
}

export function crearPartida(jugadorBlanco, jugadorNegro) {
  return conRespaldo(
    () => apiClient.post('/api/partidas', { jugadorBlanco, jugadorNegro }),
    () => demo.crearPartida(jugadorBlanco, jugadorNegro),
  );
}

export function jugar(id, desde, hasta, promocion) {
  return conRespaldo(
    () => apiClient.post(`/api/partidas/${id}/movimientos`, { desde, hasta, promocion }),
    () => demo.jugar(id, desde, hasta, promocion),
  );
}

export function estado(id) {
  return conRespaldo(
    () => apiClient.get(`/api/partidas/${id}`),
    () => demo.estado(id),
  );
}

export function jugadasLegales(id, casilla = null) {
  return conRespaldo(
    () => apiClient.get(`/api/partidas/${id}/jugadas`, { params: casilla ? { casilla } : {} }),
    () => demo.jugadasLegales(id, casilla),
  );
}

export function finalizarPartida(id, motivo) {
  return conRespaldo(
    () => apiClient.put(`/api/partidas/${id}/finalizar`, { motivo }),
    () => demo.finalizarPartida(id, motivo),
  );
}

export function mensajeDeError(error) {
  return (
    error?.response?.data?.mensaje
    ?? error?.response?.data?.message
    ?? (typeof error?.message === 'string' && error.message ? error.message : null)
    ?? 'No se pudo conectar con el servidor'
  );
}
