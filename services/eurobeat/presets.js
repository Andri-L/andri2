'use strict';

/**
 * Presets compartidos por el comando de Discord.
 * El pipeline está vendorizado en services/eurobeat.
 */

const BASE_FINISH = {
  hue: 145,
  saturation: 0.07,
  highPassRadius: 2.5,
  highPassOpacity: 0.5,
  grainAmount: 0.22,
  grainOpacity: 0.6,
  grainSeed: 1989,
};

const TONES = {
  clara: {
    label: 'Clara',
    description: 'Más alegre y energética; sirve para fotos brillantes o para aclarar caras',
    options: {
      exposure: 1,
      gamma: 1.0,
      whitePoint: 1,
      blackPoint: 0.01,
      vignetteStrength: 0.28,
      saturation: 0.2,
    },
  },
  'baja-saturacion': {
    label: 'Baja saturación',
    description: 'Tinte sutil, tono de recuerdo o literario',
    options: {
      exposure: 1,
      gamma: 1.2,
      whitePoint: 1,
      blackPoint: 0.02,
      vignetteStrength: 0.35,
      saturation: 0.07,
    },
  },
  contraste: {
    label: 'Contraste',
    description: 'Más dramática: tinte marcado y negros exaltados',
    options: {
      exposure: 1,
      gamma: 1.8,
      whitePoint: 1,
      blackPoint: 0.03,
      vignetteStrength: 0.42,
      saturation: 0.15,
    },
  },
};

const MODES = {
  full: {
    label: 'Sin texto',
    crop: false,
    title: '',
    bottomFade: 0,
  },
  cover: {
    label: 'Con texto',
    crop: true,
    zoom: 1,
    title: 'SUPER EUROBEAT',
    bottomFade: 0,
    headroom: 0,
    volumeLetterSpacing: 1,
  },
};

const PREVIEW_SIZE = 320;
const MAX_OUTPUT_SIDE = 4000;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Tamaño de salida: conserva la resolución original y limita el lado mayor a 4000 px.
 */
function outputSizeFor(width, height) {
  return Math.min(MAX_OUTPUT_SIDE, Math.max(width, height));
}

/**
 * Tamaño para el modo con texto: usa el lado menor original (el recorte 1:1),
 * sin reescalar al lado mayor.
 */
function coverSizeFor(width, height) {
  return Math.min(MAX_OUTPUT_SIDE, Math.min(width, height));
}

function randomVolume() {
  return 1 + Math.floor(Math.random() * 100);
}

/**
 * Combina acabado base + estilo + modo final.
 * @param {{toneKey:string, modeKey:'full'|'cover', size:number, volume?:number}} options
 */
function buildOptions({ toneKey, modeKey, size, volume }) {
  const tone = TONES[toneKey] || TONES.clara;
  const mode = MODES[modeKey] || MODES.full;
  const vol = volume ?? randomVolume();

  return {
    ...BASE_FINISH,
    ...tone.options,
    ...mode,
    size,
    title: mode.title,
    volume: mode.title ? `VOL. ${vol}` : '',
  };
}

module.exports = {
  BASE_FINISH,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_SIDE,
  MAX_UPLOAD_BYTES,
  MODES,
  PREVIEW_SIZE,
  TONES,
  buildOptions,
  coverSizeFor,
  outputSizeFor,
  randomVolume,
};
