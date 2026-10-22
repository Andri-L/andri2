'use strict';

const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.resolve(__dirname, 'assets', 'fonts');
const DEFAULT_TITLE_FONT = path.join(FONT_DIR, 'BodoniModa-Black.ttf');
const DEFAULT_VOLUME_FONT = path.join(FONT_DIR, 'Oswald-Bold.ttf');

let registeredTitlePath = null;
let registeredVolumePath = null;

function registerFonts(options = {}) {
  const titlePath = options.titleFontPath || DEFAULT_TITLE_FONT;
  const volumePath = options.volumeFontPath || DEFAULT_VOLUME_FONT;

  if (titlePath !== registeredTitlePath) {
    GlobalFonts.registerFromPath(titlePath, 'EurobeatTitle');
    registeredTitlePath = titlePath;
  }
  if (volumePath !== registeredVolumePath) {
    GlobalFonts.registerFromPath(volumePath, 'EurobeatVolume');
    registeredVolumePath = volumePath;
  }
}

function parseColor(value, fallback) {
  if (!value) return fallback;
  const hex = String(value).replace('#', '').trim();
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return fallback;
}

function cssColor([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

function capHeightRatio(ctx, family) {
  const previous = ctx.font;
  ctx.font = `100px ${family}`;
  const metrics = ctx.measureText('H');
  ctx.font = previous;
  return (metrics.actualBoundingBoxAscent || 70) / 100;
}

/**
 * Dibuja el texto letra por letra para controlar el tracking y la compresión
 * horizontal (la referencia usa una serif display muy condensada).
 */
function drawTrackedText(ctx, text, family, fontSize, xCenter, baseline, color, options = {}) {
  const tracking = (options.tracking ?? 0.035) * fontSize;
  const scaleX = options.scaleX ?? 1;
  const chars = [...text];

  ctx.save();
  ctx.font = `${fontSize}px ${family}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cssColor(color);

  const widths = chars.map((char) => ctx.measureText(char).width);
  const rawWidth = widths.reduce((sum, w) => sum + w, 0) + tracking * (chars.length - 1);

  ctx.translate(xCenter, baseline);
  ctx.scale(scaleX, 1);

  let x = -rawWidth / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, 0);
    x += widths[i] + tracking;
  }

  ctx.restore();
  return { rawWidth: rawWidth * scaleX, fontSize };
}

/**
 * Capa transparente con la tipografía del tutorial:
 *  - SUPER EUROBEAT arriba, centrado, verde menta y condensado.
 *  - VOL. 1 apilado verticalmente a la derecha.
 */
async function renderTypography(options = {}) {
  const width = options.width ?? 1200;
  const height = options.height ?? width;
  registerFonts(options);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const titleColor = parseColor(options.titleColor, [115, 169, 144]);
  const volumeColor = parseColor(options.volumeColor, [115, 169, 144]);
  const title = options.title ?? 'SUPER EUROBEAT';
  const volume = options.volume ?? 'VOL. 1';

  const titleFamily = 'EurobeatTitle';
  const volumeFamily = 'EurobeatVolume';

  // ---------- Título principal ----------
  if (title) {
    const targetCapHeight = (options.titleCapHeight ?? 0.108) * height;
    const titleTop = (options.titleTop ?? 0.026) * height;
    const capRatio = capHeightRatio(ctx, titleFamily);
    const fontSize = targetCapHeight / Math.max(0.4, capRatio);

    const tracking = options.titleTracking ?? 0.035;
    const targetWidth = (options.titleWidth ?? 0.9) * width;

    // Medimos el ancho natural con el tamaño elegido para decidir la compresión.
    ctx.font = `${fontSize}px ${titleFamily}`;
    const chars = [...title];
    const trackingPx = tracking * fontSize;
    const naturalWidth =
      chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0) +
      trackingPx * (chars.length - 1);

    const scaleX = Math.min(1, Math.max(0.45, targetWidth / Math.max(1, naturalWidth)));
    drawTrackedText(ctx, title, titleFamily, fontSize, width / 2, titleTop + targetCapHeight, titleColor, {
      tracking,
      scaleX,
    });
  }

  // ---------- VOL. 1 vertical ----------
  if (volume) {
    const targetCapHeight = (options.volumeCapHeight ?? 0.052) * height;
    const top = (options.volumeTop ?? 0.3) * height;
    const bottom = (options.volumeBottom ?? 0.63) * height;
    const x = (options.volumeX ?? 0.972) * width;
    const capRatio = capHeightRatio(ctx, volumeFamily);
    const fontSize = targetCapHeight / Math.max(0.4, capRatio);
    const chars = [...volume];
    const baseStep = chars.length > 1 ? (bottom - top - targetCapHeight) / (chars.length - 1) : 0;
    const letterSpacing = options.volumeLetterSpacing ?? 0;
    const step = baseStep + letterSpacing;
    const totalHeight = targetCapHeight + step * (chars.length - 1);
    const stackTop = (top + bottom - totalHeight) / 2;

    ctx.save();
    ctx.font = `${fontSize}px ${volumeFamily}`;
    ctx.fillStyle = cssColor(volumeColor);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const scaleX = options.volumeScaleX ?? 0.92;
    for (let i = 0; i < chars.length; i++) {
      const baseline = stackTop + targetCapHeight + i * step;
      ctx.save();
      ctx.translate(x, baseline);
      ctx.scale(scaleX, 1);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  return canvas.encode('png');
}

module.exports = {
  DEFAULT_TITLE_FONT,
  DEFAULT_VOLUME_FONT,
  registerFonts,
  renderTypography,
};
