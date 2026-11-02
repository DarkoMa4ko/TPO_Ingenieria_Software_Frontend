// Iconos de trazo fino, heredan el color del texto.
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

// Salir de la partida (puerta con una flecha hacia afuera).
export const IconoSalir = () => (
  <svg {...base}><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" /></svg>
);

export const IconoFlecha = () => (
  <svg {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export const IconoBandera = () => (
  <svg {...base}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
);

export const IconoAjustes = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const IconoMas = () => (
  <svg {...base}><path d="M12 5v14M5 12h14" /></svg>
);

export const IconoPanel = () => (
  <svg {...base}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M14.5 4.5v15" /></svg>
);

export const IconosCamara = {
  blancas: () => (
    <svg {...base}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 15h16" /><path d="M9 19.5l3-2.5 3 2.5" /></svg>
  ),
  negras: () => (
    <svg {...base}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16" /><path d="M9 4.5l3 2.5 3-2.5" /></svg>
  ),
  izquierda: () => (
    <svg {...base}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16" /><path d="M4.5 9L7 12l-2.5 3" /></svg>
  ),
  derecha: () => (
    <svg {...base}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M15 4v16" /><path d="M19.5 9L17 12l2.5 3" /></svg>
  ),
  cenital: () => (
    <svg {...base}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 4v16M4 12h16" /><circle cx="12" cy="12" r="2.2" /></svg>
  ),
};
