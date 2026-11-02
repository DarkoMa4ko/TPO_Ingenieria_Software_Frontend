import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, RenderPass, SMAAPreset, ToneMappingMode } from 'postprocessing';

// El RenderPass limpia color y profundidad pero no el stencil. Con autoClear
// apagado hay que pedírselo: si no, la máscara del pozo se arrastra entre cuadros.
function limpiarStencil(composer) {
  const pase = composer?.passes.find((p) => p instanceof RenderPass);
  if (pase) pase.clearPass.stencil = true;
}

// Postproceso cinematográfico: oclusión ambiental, profundidad de campo que
// sigue al foco del director de cámara, bloom en los brillos, antialiasing,
// viñeta y grano.
function Efectos({ enfoque, calidad = 'alta' }) {
  const dof = useRef(null);

  useFrame(() => {
    const efecto = dof.current;
    if (!efecto || !enfoque) return;
    efecto.target = enfoque.current.objetivo;
    efecto.bokehScale = enfoque.current.intensidad * 5.5;
  });

  const alta = calidad === 'alta';
  return (
    // Sin MSAA: con multisampling, cada pasada que lee la profundidad (N8AO y la
    // profundidad de campo) obliga a resolver un buffer de profundidad+stencil
    // multimuestreado, y en Windows (ANGLE/D3D11) eso costaba ~20 ms por cuadro a
    // 1080p. Los bordes los suaviza SMAA, después del tone mapping.
    //
    // Sin MSAA la textura de profundidad queda adjunta al buffer donde se dibuja la
    // escena (A), y las pasadas se alternan entre A y B. Por eso el orden importa:
    // escena → A, N8AO → B, bloom + tone mapping → A, SMAA → B y la profundidad de
    // campo con viñeta y grano → pantalla. Ninguna pasada que lee la profundidad
    // escribe en A (sería un bucle de realimentación y la imagen sale negra).
    //
    // autoClear apagado: si no, cada pasada que dibuja en A borra su profundidad y
    // la profundidad de campo, que la lee al final, pierde el foco en las
    // cinemáticas. La escena se limpia igual con el ClearPass del RenderPass.
    <EffectComposer ref={limpiarStencil} autoClear={false} multisampling={0} enableNormalPass={false} stencilBuffer>
      <N8AO
        aoRadius={0.55}
        distanceFalloff={0.6}
        intensity={2.4}
        // A media resolución con reescalado según profundidad: casi idéntico y
        // mucho más barato que "high" a resolución completa.
        quality={alta ? 'medium' : 'low'}
        halfRes
        depthAwareUpsampling
        color="#0a0604"
      />
      <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={0.55} radius={0.72} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA preset={alta ? SMAAPreset.ULTRA : SMAAPreset.MEDIUM} />
      <DepthOfField ref={dof} worldFocusRange={4.5} bokehScale={0} resolutionScale={0.5} />
      <Vignette offset={0.22} darkness={0.72} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.22} />
    </EffectComposer>
  );
}

export default memo(Efectos);
