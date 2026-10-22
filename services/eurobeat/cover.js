'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const {
  applyFilmGrain,
  applyHighPass,
  applyLowKeyAndTint,
  applyVignette,
} = require('./imageOps');
const { renderTypography } = require('./typography');

const ROOT = path.resolve(__dirname, '..');

const DEFAULTS = {
  size: 1200,
  // El recorte y el texto quedan desactivados por defecto.
  // Se activan cuando el pipeline se use para generar una portada final en el bot.
  crop: false,
  zoom: 1.18,
  focusY: 0.25,
  headroom: 0.135,
  blackPoint: 0.055,
  whitePoint: 0.96,
  contrast: 0.18,
  exposure: 1,
  gamma: 3.4,
  hue: 145,
  saturation: 0.07,
  highPassRadius: 2.5,
  highPassOpacity: 0.5,
  grainAmount: 0.22,
  grainOpacity: 0.6,
  grainSeed: 1989,
  vignetteStrength: 0.5,
  vignetteInner: 0.32,
  vignetteOuter: 0.86,
  vignetteCenterY: 0.43,
  bottomFade: 0,
  title: '',
  volume: '',
  titleColor: '#73A990',
  volumeColor: '#73A990',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCrop(crop, width, height) {
  if (!crop) return null;
  const side = Math.min(crop.width, crop.height);
  const left = clamp(Math.round(crop.left), 0, Math.max(0, width - side));
  const top = clamp(Math.round(crop.top), 0, Math.max(0, height - side));
  return { left, top, width: side, height: side };
}

function autoCrop(width, height, zoom, focusY) {
  const side = Math.min(width, height) / Math.max(1, zoom);
  const left = (width - side) / 2;
  const top = clamp(focusY * height - side / 2, 0, Math.max(0, height - side));
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(side),
    height: Math.round(side),
  };
}

function resolveCrop(option, width, height, options) {
  if (option === true) {
    return autoCrop(width, height, options.zoom, options.focusY);
  }
  if (option && typeof option === 'object') {
    return normalizeCrop(option, width, height);
  }
  return null;
}

function rotatedSize(metadata) {
  const swap = [5, 6, 7, 8].includes(metadata.orientation);
  return {
    width: swap ? metadata.height : metadata.width,
    height: swap ? metadata.width : metadata.height,
  };
}

/**
 * Genera la imagen con el tratamiento Super Eurobeat.
 *
 * Por defecto NO recorta y NO agrega texto: devuelve la foto completa procesada,
 * con el lado mayor igual a `size`. El recorte y la tipografía se activan con
 * `crop` y `title`/`volume` para la portada final.
 *
 * @param {object} options
 * @param {string|Buffer} options.input  Ruta o Buffer de la foto.
 * @param {string} [options.outputPath]  Ruta del PNG final. Si se omite, solo devuelve el buffer.
 * @param {boolean|{left:number,top:number,width:number,height:number}} [options.crop]
 *        `true` = recorte cuadrado automático; objeto = recorte manual. Por defecto no recorta.
 * @param {string} [options.title]       Texto superior. Vacío por defecto.
 * @param {string} [options.volume]      Texto vertical derecho. Vacío por defecto.
 * @returns {Promise<{buffer: Buffer, outputPath: string|null, width: number, height: number, crop: object|null}>}
 */
async function createCover(options = {}) {
  const input = options.input ?? options.inputPath;
  if (!input) throw new Error('Falta options.input (ruta o Buffer de imagen).');

  const size = Math.max(256, Math.round(options.size ?? DEFAULTS.size));
  const zoom = options.zoom ?? DEFAULTS.zoom;
  const focusY = options.focusY ?? DEFAULTS.focusY;
  const headroom = clamp(options.headroom ?? DEFAULTS.headroom, 0, 0.3);

  const metadata = await sharp(input).metadata();
  const source = rotatedSize(metadata);
  if (!source.width || !source.height) throw new Error('No se pudo leer el tamaño de la imagen.');

  const cropOption = options.crop ?? DEFAULTS.crop;
  const crop = resolveCrop(cropOption, source.width, source.height, { zoom, focusY });

  let width;
  let height;
  let image;

  if (crop) {
    width = size;
    height = size;
    image = sharp(input)
      .rotate()
      .flatten({ background: '#000000' })
      .extract(crop)
      .resize(size, size, { fit: 'fill', kernel: 'lanczos3' });

    if (headroom > 0) {
      const top = Math.round(headroom * size);
      image = image
        .extend({
          top,
          bottom: 0,
          left: 0,
          right: 0,
          background: { r: 0, g: 0, b: 0 },
        })
        .extract({ left: 0, top: 0, width: size, height: size });
    }
  } else {
    const maxSide = Math.max(source.width, source.height);
    const scale = size / maxSide;
    width = Math.max(1, Math.round(source.width * scale));
    height = Math.max(1, Math.round(source.height * scale));

    image = sharp(input)
      .rotate()
      .flatten({ background: '#000000' })
      .resize(width, height, { fit: 'fill', kernel: 'lanczos3' });
  }

  const { data: raw, info } = await image.raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`Se esperaban 3 canales RGB, llegaron ${info.channels}.`);

  // Paso 2 + 3: curvas low-key, desaturado y virado menta.
  let pixels = applyLowKeyAndTint(raw, {
    blackPoint: options.blackPoint ?? DEFAULTS.blackPoint,
    whitePoint: options.whitePoint ?? DEFAULTS.whitePoint,
    contrast: options.contrast ?? DEFAULTS.contrast,
    exposure: options.exposure ?? DEFAULTS.exposure,
    gamma: options.gamma ?? DEFAULTS.gamma,
    hue: options.hue ?? DEFAULTS.hue,
    saturation: options.saturation ?? DEFAULTS.saturation,
  });

  // Paso 4: High Pass + Overlay.
  pixels = await applyHighPass(pixels, width, height, {
    radius: options.highPassRadius ?? DEFAULTS.highPassRadius,
    opacity: options.highPassOpacity ?? DEFAULTS.highPassOpacity,
  });

  // Extra de acabado: viñeta y caída inferior para el look de portada.
  pixels = applyVignette(pixels, width, height, {
    strength: options.vignette === false ? 0 : (options.vignetteStrength ?? DEFAULTS.vignetteStrength),
    inner: options.vignetteInner ?? DEFAULTS.vignetteInner,
    outer: options.vignetteOuter ?? DEFAULTS.vignetteOuter,
    centerY: options.vignetteCenterY ?? DEFAULTS.vignetteCenterY,
    bottomStrength: options.bottomFade === false ? 0 : (options.bottomFade ?? DEFAULTS.bottomFade),
  });

  // Paso 5: grano de película monocromático.
  pixels = applyFilmGrain(pixels, width, height, {
    amount: options.grainAmount ?? DEFAULTS.grainAmount,
    opacity: options.grainOpacity ?? DEFAULTS.grainOpacity,
    seed: options.grainSeed ?? DEFAULTS.grainSeed,
  });

  const title = options.title ?? DEFAULTS.title;
  const volume = options.volume ?? DEFAULTS.volume;
  const hasText = Boolean(title || volume);

  let pipeline = sharp(pixels, { raw: { width, height, channels: 3 } });

  // Paso 6: tipografía opcional (capa PNG transparente).
  if (hasText) {
    const textLayer = await renderTypography({
      width,
      height,
      title,
      volume,
      titleColor: options.titleColor ?? DEFAULTS.titleColor,
      volumeColor: options.volumeColor ?? DEFAULTS.volumeColor,
      titleFontPath: options.titleFontPath,
      volumeFontPath: options.volumeFontPath,
      titleWidth: options.titleWidth,
      titleTop: options.titleTop,
      titleCapHeight: options.titleCapHeight,
      titleTracking: options.titleTracking,
      volumeTop: options.volumeTop,
      volumeBottom: options.volumeBottom,
      volumeX: options.volumeX,
      volumeCapHeight: options.volumeCapHeight,
      volumeLetterSpacing: options.volumeLetterSpacing,
    });
    pipeline = pipeline.composite([{ input: textLayer, blend: 'over' }]);
  }

  const outputBuffer = await pipeline
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  let outputPath = null;
  if (options.outputPath) {
    outputPath = path.resolve(options.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, outputBuffer);
  }

  return { buffer: outputBuffer, outputPath, width, height, crop };
}

module.exports = { DEFAULTS, ROOT, createCover };
