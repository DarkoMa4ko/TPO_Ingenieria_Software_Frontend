import { useEffect, useState } from 'react';
import * as THREE from 'three';

// Logo del grupo (public/texturas/logo-grupo7.svg) pasado a una textura: blanco
// sobre transparente, recortado a su contenido y con un margen para que el halo
// (que sale de los mipmaps) no choque con el borde. Lo usan el logo luminoso
// del inicio y la pantalla del chaflán; se carga una sola vez.
const RUTA = `${import.meta.env.BASE_URL ?? '/'}texturas/logo-grupo7.svg`;
const ALTO = 1024;
const MARGEN = 0.14;

let promesa = null;

function rasterizar(imagen) {
  const relacion = imagen.width && imagen.height ? imagen.width / imagen.height : 612 / 792;
  const ancho = Math.round(ALTO * relacion);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = ALTO;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imagen, 0, 0, ancho, ALTO);

  // Caja del contenido según el alfa.
  const { data } = ctx.getImageData(0, 0, ancho, ALTO);
  let x0 = ancho;
  let y0 = ALTO;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < ALTO; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      if (data[(y * ancho + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) [x0, y0, x1, y1] = [0, 0, ancho - 1, ALTO - 1];

  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const margen = Math.round(Math.max(w, h) * MARGEN);
  const final = document.createElement('canvas');
  final.width = w + margen * 2;
  final.height = h + margen * 2;
  const fctx = final.getContext('2d');
  fctx.drawImage(lienzo, x0, y0, w, h, margen, margen, w, h);
  // El SVG viene en negro: se pinta de blanco conservando la forma.
  fctx.globalCompositeOperation = 'source-in';
  fctx.fillStyle = '#ffffff';
  fctx.fillRect(0, 0, final.width, final.height);

  const textura = new THREE.CanvasTexture(final);
  textura.anisotropy = 8;
  return { textura, aspecto: final.width / final.height, texel: new THREE.Vector2(1 / final.width, 1 / final.height) };
}

export function cargarLogoGrupo() {
  if (!promesa) {
    promesa = new Promise((resolver, rechazar) => {
      const imagen = new Image();
      imagen.onload = () => resolver(rasterizar(imagen));
      imagen.onerror = rechazar;
      imagen.src = RUTA;
    });
  }
  return promesa;
}

// null hasta que termina de cargar.
export function useLogoGrupo() {
  const [logo, setLogo] = useState(null);
  useEffect(() => {
    let vivo = true;
    cargarLogoGrupo().then((l) => { if (vivo) setLogo(l); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  return logo;
}
