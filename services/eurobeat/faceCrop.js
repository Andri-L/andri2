'use strict';

const sharp = require('sharp');
const smartcrop = require('smartcrop');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rotatedSize(metadata) {
  const swap = [5, 6, 7, 8].includes(metadata.orientation);
  return {
    width: swap ? metadata.height : metadata.width,
    height: swap ? metadata.width : metadata.height,
  };
}

function centerCrop(width, height, focusY) {
  const side = Math.min(width, height);
  return {
    left: Math.round((width - side) / 2),
    top: Math.round(clamp(focusY * height - side / 2, 0, Math.max(0, height - side))),
    width: side,
    height: side,
  };
}

/**
 * Adaptador mínimo para que smartcrop use sharp en vez de node-canvas.
 * Trabaja sobre una versión reducida de la imagen para que sea liviano.
 */
function sharpImageOperations(inputBuffer) {
  return {
    open: async () => {
      const metadata = await sharp(inputBuffer).metadata();
      const { width, height } = rotatedSize(metadata);
      return { width, height };
    },
    resample: async (_image, width, height) => ({
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    }),
    getData: async (image) => {
      const { data, info } = await sharp(inputBuffer)
        .rotate()
        .resize(image.width, image.height, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return new smartcrop.ImgData(info.width, info.height, data);
    },
  };
}

/**
 * Busca un recorte cuadrado 1:1 tratando de centrar la zona más interesante
 * (caras/piel). Si no lo logra, cae a un recorte centrado.
 *
 * @param {Buffer} inputBuffer
 * @param {{fallbackFocusY?: number}} [options]
 * @returns {Promise<{left:number,top:number,width:number,height:number}|null>}
 *          `null` si la imagen ya es cuadrada.
 */
async function suggestSquareCrop(inputBuffer, options = {}) {
  const metadata = await sharp(inputBuffer).metadata();
  const { width, height } = rotatedSize(metadata);
  if (!width || !height) return null;

  // Si ya es cuadrada, no hay nada que recortar.
  if (width === height) return null;

  const side = Math.min(width, height);
  const focusY = options.fallbackFocusY ?? 0.25;

  try {
    const result = await smartcrop.crop(inputBuffer, {
      width: side,
      height: side,
      minScale: 1,
      imageOperations: sharpImageOperations(inputBuffer),
    });

    const crop = result?.topCrop;
    if (!crop || !crop.width || !crop.height) {
      return centerCrop(width, height, focusY);
    }

    // smartcrop puede devolver un rectángulo algo distinto; lo centramos
    // dentro del cuadrado fijo de lado `side`.
    const left = Math.round(crop.x + (crop.width - side) / 2);
    const top = Math.round(crop.y + (crop.height - side) / 2);

    return {
      left: clamp(left, 0, Math.max(0, width - side)),
      top: clamp(top, 0, Math.max(0, height - side)),
      width: side,
      height: side,
    };
  } catch (error) {
    console.warn('smartcrop falló, usando recorte centrado:', error.message);
    return centerCrop(width, height, focusY);
  }
}

module.exports = { suggestSquareCrop };
