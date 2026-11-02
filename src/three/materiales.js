
import * as THREE from 'three';
import { useGLTF, useTexture } from '@react-three/drei';
import { aristasDe, conRecorteIntro } from './holograma.js';

// Los modelos y texturas se generan en Blender (modelos/blender/ajedrez.blend):
// mármol, madera y oclusión ambiental vienen horneados con Cycles.
const BASE = import.meta.env.BASE_URL ?? '/';
export const DRACO = `${BASE}draco/`;

export const RUTAS_PIEZAS = {
  p: `${BASE}modelos/piezas/pawn.glb`,
  r: `${BASE}modelos/piezas/rook.glb`,
  n: `${BASE}modelos/piezas/knight.glb`,
  b: `${BASE}modelos/piezas/bishop.glb`,
  q: `${BASE}modelos/piezas/queen.glb`,
  k: `${BASE}modelos/piezas/king.glb`,
};
export const RUTA_TABLERO = `${BASE}modelos/tablero.glb`;

const NOMBRES = { p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' };
const tex = (ruta) => `${BASE}texturas/${ruta}.webp`;

const RUTAS_TEXTURAS_PIEZAS = Object.fromEntries(
  Object.values(NOMBRES).flatMap((nombre) => [
    [`${nombre}_b`, tex(`piezas/${nombre}_b`)],
    [`${nombre}_b_orm`, tex(`piezas/${nombre}_b_orm`)],
    [`${nombre}_n`, tex(`piezas/${nombre}_n`)],
    [`${nombre}_n_orm`, tex(`piezas/${nombre}_n_orm`)],
  ]),
);

const RUTAS_TEXTURAS_TABLERO = Object.fromEntries(
  ['casillas', 'casillas_oscuro', 'marco', 'bandeja', 'mesa'].flatMap((nombre) => [
    [`${nombre}_color`, tex(`tablero/${nombre}_color`)],
    [`${nombre}_orm`, tex(`tablero/${nombre}_orm`)],
    [`${nombre}_normal`, tex(`tablero/${nombre}_normal`)],
  ]),
);

const RUTAS_PAREDES = {
  ladrillo: tex('mesa/pared_ladrillo'),
};

function preparar(texturas, { flipY }) {
  for (const [clave, textura] of Object.entries(texturas)) {
    textura.flipY = flipY;
    textura.anisotropy = 8;
    textura.colorSpace = clave.endsWith('_color') || /_[bn]$/.test(clave)
      ? THREE.SRGBColorSpace
      : THREE.NoColorSpace;
    textura.needsUpdate = true;
  }
  return texturas;
}

// ---------------------------------------------------------------------------
// Metales y telas sin textura
// ---------------------------------------------------------------------------
export const MATERIAL_LATON = conRecorteIntro(new THREE.MeshPhysicalMaterial({
  color: '#d4ae6e',
  metalness: 1,
  roughness: 0.24,
  clearcoat: 0.4,
  clearcoatRoughness: 0.15,
  envMapIntensity: 1.25,
}));

export const MATERIAL_ACERO = conRecorteIntro(new THREE.MeshPhysicalMaterial({
  color: '#c3cad2',
  metalness: 1,
  roughness: 0.3,
  clearcoat: 0.3,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1.3,
}));

// Letras y números del tablero oscuro retroiluminados, como las teclas de un
// teclado: acrílico esmerilado con luz blanca fría que pasa el umbral del bloom.
export const MATERIAL_COORDENADAS_LUZ = conRecorteIntro(new THREE.MeshPhysicalMaterial({
  color: '#0d1014',
  emissive: '#d4e9ff',
  emissiveIntensity: 2.6,
  roughness: 0.4,
  metalness: 0,
  clearcoat: 0.5,
  clearcoatRoughness: 0.2,
  envMapIntensity: 0.4,
}));

// Vidrio negro opaco y pulido: bordes del tablero oscuro, zócalo y canto de la mesa.
export const MATERIAL_VIDRIO_NEGRO = conRecorteIntro(new THREE.MeshPhysicalMaterial({
  color: '#020203',
  roughness: 0.035,
  metalness: 0,
  ior: 1.52,
  specularIntensity: 1,
  clearcoat: 1,
  clearcoatRoughness: 0.015,
  envMapIntensity: 1.7,
}));

export const MATERIAL_EBANO = conRecorteIntro(new THREE.MeshPhysicalMaterial({
  color: '#0c0907',
  roughness: 0.42,
  clearcoat: 0.6,
  clearcoatRoughness: 0.3,
  envMapIntensity: 0.6,
}));

export const MATERIAL_TERCIOPELO = conRecorteIntro(new THREE.MeshPhysicalMaterial({
  color: '#2a070d',
  roughness: 0.95,
  sheen: 1,
  sheenColor: new THREE.Color('#6e2230'),
  sheenRoughness: 0.5,
  envMapIntensity: 0.25,
}));

// ---------------------------------------------------------------------------
// Piezas: un material por tipo y color (cada tipo tiene su propio horneado).
// ---------------------------------------------------------------------------
// useTexture con un diccionario devuelve un objeto nuevo en cada render, así que
// los recursos se arman una sola vez y se guardan por modelo cargado. Sin esto,
// cada jugada reclonaba texturas de 4K y recreaba materiales (trabas de ~1 s).
const cacheRecursos = new WeakMap();
function unaVez(clave, crear) {
  if (!cacheRecursos.has(clave)) cacheRecursos.set(clave, crear());
  return cacheRecursos.get(clave);
}

export function useRecursosPiezas() {
  const gltfs = useGLTF(Object.values(RUTAS_PIEZAS), DRACO);
  const texturas = useTexture(RUTAS_TEXTURAS_PIEZAS);

  return unaVez(gltfs[0], () => {
    preparar(texturas, { flipY: false });
    const geometrias = {};
    const materiales = {};

    Object.keys(RUTAS_PIEZAS).forEach((tipo, indice) => {
      const nombre = NOMBRES[tipo];
      const mallas = [];
      gltfs[indice].scene.traverse((objeto) => { if (objeto.isMesh) mallas.push(objeto); });
      const cuerpo = mallas.find((m) => !m.name.includes('cross')) ?? mallas[0];
      const cruz = mallas.find((m) => m.name.includes('cross'));
      geometrias[tipo] = {
        cuerpo: cuerpo.geometry,
        cruz: cruz?.geometry ?? null,
        aristas: aristasDe(cuerpo.geometry, 16),
        aristasCruz: cruz ? aristasDe(cruz.geometry, 30) : null,
      };

      for (const [sufijo, blanco] of [['b', true], ['n', false]]) {
        const orm = texturas[`${nombre}_${sufijo}_orm`];
        materiales[`${tipo}${sufijo}`] = conRecorteIntro(new THREE.MeshPhysicalMaterial({
          map: texturas[`${nombre}_${sufijo}`],
          roughnessMap: orm,
          aoMap: orm,
          aoMapIntensity: 1,
          roughness: 1,
          metalness: 0,
          clearcoat: blanco ? 0.55 : 0.85,
          clearcoatRoughness: blanco ? 0.07 : 0.04,
          specularIntensity: blanco ? 0.6 : 0.9,
          envMapIntensity: blanco ? 0.95 : 1.25,
        }));
      }
    });

    return { geometrias, materiales };
  });
}

// ---------------------------------------------------------------------------
// Tablero, bandejas y mesa
// ---------------------------------------------------------------------------
export function useRecursosTablero() {
  const gltf = useGLTF(RUTA_TABLERO, DRACO);
  const texturas = useTexture(RUTAS_TEXTURAS_TABLERO);

  return unaVez(gltf, () => {
    preparar(texturas, { flipY: false });
    const mallas = {};
    gltf.scene.traverse((objeto) => {
      if (objeto.isMesh) mallas[objeto.name.replace(/\.\d+$/, '')] = objeto.geometry;
    });

    // La superficie de juego usa un plano propio (MeshReflectorMaterial espera
    // un plano en XY), así que sus texturas van con la orientación estándar.
    const casillas = {};
    for (const estilo of ['casillas', 'casillas_oscuro']) {
      casillas[estilo] = Object.fromEntries(
        ['color', 'orm', 'normal'].map((canal) => {
          const copia = texturas[`${estilo}_${canal}`].clone();
          copia.flipY = true;
          copia.needsUpdate = true;
          return [canal, copia];
        }),
      );
    }

    const madera = (nombre) => conRecorteIntro(new THREE.MeshPhysicalMaterial({
      map: texturas[`${nombre}_color`],
      roughnessMap: texturas[`${nombre}_orm`],
      aoMap: texturas[`${nombre}_orm`],
      normalMap: texturas[`${nombre}_normal`],
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.9,
      clearcoat: 0.75,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.9,
    }));

    const mesa = {};
    for (const clave of ['mesa_color', 'mesa_orm', 'mesa_normal']) {
      const copia = texturas[clave].clone();
      copia.wrapS = THREE.RepeatWrapping;
      copia.wrapT = THREE.RepeatWrapping;
      copia.repeat.set(9, 6);
      copia.needsUpdate = true;
      mesa[clave] = copia;
    }

    return {
      mallas,
      casillas,
      mesa,
      materiales: {
        marco: madera('marco'),
        bandeja: madera('bandeja'),
        // Marco del tablero oscuro: vidrio negro pulido (la oclusión horneada se reutiliza).
        marcoOscuro: conRecorteIntro(new THREE.MeshPhysicalMaterial({
          color: '#020203',
          aoMap: texturas.marco_orm,
          roughness: 0.035,
          metalness: 0,
          ior: 1.52,
          specularIntensity: 1,
          clearcoat: 1,
          clearcoatRoughness: 0.015,
          envMapIntensity: 1.7,
        })),
      },
    };
  });
}

// Paredes del pozo del espejo infinito (texturas sin costuras).
export function useParedesMesa() {
  const texturas = useTexture(RUTAS_PAREDES);
  return unaVez(texturas.ladrillo, () => {
    for (const textura of Object.values(texturas)) {
      textura.wrapS = THREE.RepeatWrapping;
      textura.wrapT = THREE.RepeatWrapping;
      textura.colorSpace = THREE.SRGBColorSpace;
      textura.anisotropy = 8;
      textura.needsUpdate = true;
    }
    return texturas;
  });
}

useGLTF.preload(Object.values(RUTAS_PIEZAS), DRACO);
useGLTF.preload(RUTA_TABLERO, DRACO);
