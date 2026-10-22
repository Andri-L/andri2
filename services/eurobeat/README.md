# Pipeline Eurobeat (vendorizado)

Copia autocontenida del pipeline de `IMG-TO-EUROBEAT` dentro de Andri2.
En la VPS **no hace falta** tener el proyecto `IMG-TO-EUROBEAT`: este directorio
incluye el código y las fuentes necesarias.

## Archivos

- `cover.js` — pipeline completo (`createCover`).
- `imageOps.js` — curvas, tinte, high pass, grano y viñeta.
- `typography.js` — títulos opcionales.
- `preview.js` — hoja comparativa de 3 tonalidades.
- `faceCrop.js` — recorte 1:1 sin zoom con `smartcrop` (liviano, sin modelo pesado).
- `presets.js` — presets de brillo, modos, colores y tamaños.
- `assets/fonts/` — Bodoni Moda Black y Oswald Bold (SIL OFL).
- `assets/hue_reference.jpg` — imagen de referencia con los 9 colores que se manda al elegir el color.

## Uso

```js
const { createCover } = require('./cover');
const { buildOptions } = require('./presets');

const { buffer } = await createCover({
  input: imageBuffer,
  ...buildOptions({ toneKey: 'oscura', modeKey: 'cover', size: 1200, volume: 42 }),
});
```

No se debe importar `src/index.js` del proyecto original: es la CLI y ejecuta
`main()` al cargarse. El bot usa directamente `cover.js`.
