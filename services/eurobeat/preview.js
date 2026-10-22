'use strict';

const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const LABEL_FONT = path.join(__dirname, 'assets', 'fonts', 'Oswald-Bold.ttf');
let labelFamily = 'sans-serif';

try {
  if (GlobalFonts.registerFromPath(LABEL_FONT, 'EurobeatPreview')) {
    labelFamily = 'EurobeatPreview';
  }
} catch {
  // Si falla la fuente incluida, se usa la sans-serif del sistema.
}

const THUMB_SIZE = 320;
const GAP = 12;
const HEADER = 38;

/**
 * Arma una hoja comparativa con las tres previsualizaciones.
 * @param {Array<{key:string,label:string,buffer:Buffer}>} variants
 * @returns {Promise<Buffer>}
 */
async function buildToneSheet(variants) {
  if (!variants.length) throw new Error('No hay previsualizaciones para mostrar.');

  const width = variants.length * THUMB_SIZE + (variants.length + 1) * GAP;
  const height = HEADER + THUMB_SIZE + GAP;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const x = GAP + i * (THUMB_SIZE + GAP);

    ctx.fillStyle = '#73A990';
    ctx.font = `20px ${labelFamily}`;
    ctx.fillText(`${i + 1} · ${variant.label.toUpperCase()}`, x + 2, HEADER / 2);

    const image = await loadImage(variant.buffer);
    const scale = Math.min(THUMB_SIZE / image.width, THUMB_SIZE / image.height);
    const drawWidth = Math.round(image.width * scale);
    const drawHeight = Math.round(image.height * scale);
    const drawX = x + Math.round((THUMB_SIZE - drawWidth) / 2);
    const drawY = HEADER + Math.round((THUMB_SIZE - drawHeight) / 2);
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  return canvas.encode('png');
}

module.exports = { buildToneSheet };
