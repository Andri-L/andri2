'use strict';

const sharp = require('sharp');

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Curva tonal maestra (equivalente a Colors > Curves de GIMP).
 * Aplasta las sombras a negro puro y oscurece los medios tonos para el look low-key.
 */
function buildToneLut(options = {}) {
  const blackPoint = options.blackPoint ?? 0.055;
  const whitePoint = options.whitePoint ?? 0.96;
  const sCurve = options.contrast ?? 0.32;
  const gamma = options.gamma ?? 1.22;
  const exposure = options.exposure ?? 1;
  const lut = new Uint8ClampedArray(256);

  for (let i = 0; i < 256; i++) {
    // La exposición baja las luces antes de la curva; sirve para fotos quemadas.
    let x = clamp01((i / 255) * exposure);

    if (x <= blackPoint) {
      lut[i] = 0;
      continue;
    }

    x = (x - blackPoint) / Math.max(0.001, whitePoint - blackPoint);
    x = clamp01(x);

    // S-curve suave: más contraste sin romper la continuidad del histograma.
    const smooth = x * x * (3 - 2 * x);
    x = x * (1 - sCurve) + smooth * sCurve;

    // Gamma > 1 hunde los medios tonos (piel más oscura, fondo limpio).
    x = Math.pow(x, gamma);

    lut[i] = Math.round(clamp01(x) * 255);
  }

  return lut;
}

function srgbLuminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Convierte un gris (0-255) a un color HSL con tono/saturación fijos.
 * Replica Colors > Desaturate (Luminance) + Colors > Colorize en GIMP.
 */
function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  if (s === 0) return [l, l, l];

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const hueToRgb = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return [hueToRgb(h + 1 / 3), hueToRgb(h), hueToRgb(h - 1 / 3)];
}

/**
 * Paso 2 + 3 del tutorial: curvas, desaturado por luminancia y virado menta.
 * Trabaja sobre un buffer RGB crudo (3 canales) y devuelve otro buffer RGB.
 */
function applyLowKeyAndTint(rgb, options = {}) {
  const lut = buildToneLut(options);
  const hue = (options.hue ?? 145) / 360;
  const saturation = options.saturation ?? 0.2;
  const out = Buffer.alloc(rgb.length);

  for (let i = 0; i < rgb.length; i += 3) {
    const r = lut[rgb[i]];
    const g = lut[rgb[i + 1]];
    const b = lut[rgb[i + 2]];

    // Desaturate > Luminance
    let lum = srgbLuminance(r, g, b) / 255;

    // Un pelo de luz en los medios tonos para que la piel no quede muerta.
    lum = clamp01(lum + (options.midLift ?? 0.015) * Math.sin(Math.PI * lum));

    // Colorize: se conserva la luminosidad y se aplica el tinte menta.
    const [cr, cg, cb] = hslToRgb(hue, saturation, lum);
    out[i] = Math.round(cr * 255);
    out[i + 1] = Math.round(cg * 255);
    out[i + 2] = Math.round(cb * 255);
  }

  return out;
}

/** Viñeta radial + caída inferior. Ayuda a fundir ropa/hombros con el negro. */
function applyVignette(rgb, width, height, options = {}) {
  const strength = options.strength ?? 0.42;
  const inner = options.inner ?? 0.34;
  const outer = options.outer ?? 0.86;
  const centerX = options.centerX ?? 0.5;
  const centerY = options.centerY ?? 0.43;
  const bottomStart = options.bottomStart ?? 0.62;
  const bottomStrength = options.bottomStrength ?? 0.9;

  if (strength <= 0 && bottomStrength <= 0) return rgb;

  const out = Buffer.alloc(rgb.length);

  for (let y = 0; y < height; y++) {
    const ny = y / (height - 1);
    const bottomT = clamp01((ny - bottomStart) / Math.max(0.001, 1 - bottomStart));
    // Curva con caída temprana: funde la ropa con el negro sin tocar la cara.
    const bottomMask = Math.pow(bottomT, 0.62) * bottomStrength;

    for (let x = 0; x < width; x++) {
      const nx = x / (width - 1);
      const dx = nx - centerX;
      const dy = (ny - centerY) * 1.06;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = clamp01((dist - inner) / Math.max(0.001, outer - inner));
      const radial = t * t * (3 - 2 * t) * strength;

      const factor = (1 - radial) * (1 - bottomMask);
      const idx = (y * width + x) * 3;
      out[idx] = Math.round(rgb[idx] * factor);
      out[idx + 1] = Math.round(rgb[idx + 1] * factor);
      out[idx + 2] = Math.round(rgb[idx + 2] * factor);
    }
  }

  return out;
}

function overlayChannel(base, blend) {
  const b = base / 255;
  const s = blend / 255;
  const v = b < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
  return v * 255;
}

/**
 * Paso 4: filtro Paso Alto (3-5 px) + fusión Overlay.
 * Se calcula el canal de luminancia, se desenfoca y se superpone el detalle.
 */
async function applyHighPass(rgb, width, height, options = {}) {
  const radius = options.radius ?? 4;
  const opacity = options.opacity ?? 1;
  if (radius <= 0 || opacity <= 0) return rgb;

  const gray = Buffer.alloc(width * height);
  for (let i = 0, p = 0; i < rgb.length; i += 3, p++) {
    gray[p] = Math.round(srgbLuminance(rgb[i], rgb[i + 1], rgb[i + 2]));
  }

  // Ojo: sharp.blur() devuelve 3 canales aunque la entrada sea gris.
  // extractChannel(0) garantiza un buffer de 1 byte por píxel.
  const blurred = await sharp(gray, { raw: { width, height, channels: 1 } })
    .blur(radius)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const out = Buffer.alloc(rgb.length);
  for (let p = 0, i = 0; p < gray.length; p++, i += 3) {
    const highPass = clamp255(128 + gray[p] - blurred[p]);
    for (let c = 0; c < 3; c++) {
      const base = rgb[i + c];
      const blended = overlayChannel(base, highPass);
      out[i + c] = Math.round(base * (1 - opacity) + blended * opacity);
    }
  }

  return out;
}

/** PRNG determinista (mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido gaussiano monocromático (Box-Muller). */
function makeGaussian(seed) {
  const random = mulberry32(seed);
  let spare = null;

  return function gaussian() {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = random();
    while (v === 0) v = random();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

/**
 * Paso 5: grano de película monocromático sobre gris neutro,
 * mezclado en Overlay. No toca el fondo negro puro.
 */
function applyFilmGrain(rgb, width, height, options = {}) {
  const amount = options.amount ?? 0.22;
  const opacity = options.opacity ?? 0.6;
  if (amount <= 0 || opacity <= 0) return rgb;

  const gaussian = makeGaussian(options.seed ?? 1989);
  const sigma = amount * 64;
  const out = Buffer.alloc(rgb.length);

  for (let i = 0; i < rgb.length; i += 3) {
    const noise = clamp255(128 + gaussian() * sigma);
    for (let c = 0; c < 3; c++) {
      const base = rgb[i + c];
      if (base === 0) {
        out[i + c] = 0;
      } else {
        const blended = overlayChannel(base, noise);
        out[i + c] = Math.round(base * (1 - opacity) + blended * opacity);
      }
    }
  }

  return out;
}

module.exports = {
  applyFilmGrain,
  applyHighPass,
  applyLowKeyAndTint,
  applyVignette,
  buildToneLut,
  clamp255,
  hslToRgb,
  overlayChannel,
  srgbLuminance,
};
