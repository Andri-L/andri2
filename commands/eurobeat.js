'use strict';

const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const sharp = require('sharp');

const { createCover } = require('../services/eurobeat/cover');
const { buildToneSheet } = require('../services/eurobeat/preview');
const { suggestSquareCrop } = require('../services/eurobeat/faceCrop');
const {
  HUE_OPTIONS,
  MAX_INPUT_BYTES,
  MAX_UPLOAD_BYTES,
  PREVIEW_SIZE,
  TONES,
  buildOptions,
  coverSizeFor,
  outputSizeFor,
  randomVolume,
} = require('../services/eurobeat/presets');

const HUE_REFERENCE = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'eurobeat', 'assets', 'hue_reference.jpg')
);
const HUE_PROMPT =
  '🎨 **Elegí el color**\n' +
  'Reaccioná con el emoji del color que quieras:\n' +
  HUE_OPTIONS.map((option) => `${option.emoji} ${option.label}`).join(' · ');
const HUE_PROMPT_NO_TEXT =
  HUE_PROMPT + '\nEn este modo el color tiñe la foto; no se agrega texto.';

const COOLDOWN_MS = 20_000;
const TTL_MS = 15 * 60 * 1000;
const MAX_PIXELS = 200_000_000;
const IMAGE_EXTENSION = /\.(png|jpe?g|webp)$/i;

const pending = new Map();
const cooldowns = new Map();

const HELP = `🎨 **Super Eurobeat**
Adjuntá una imagen o respondé a una imagen con \`a!eurobeat\`.

Te muestro 3 estilos (luz, saturación y contraste) en baja resolución. Después elegís si querés la versión con texto o sin texto.
En los dos casos elegís el color reaccionando con un emoji.
Si elegís con texto: \`SUPER EUROBEAT\` + un volumen aleatorio entre 1 y 100.

La salida conserva la resolución original, con un máximo de 4000 px en el lado mayor.
Si el PNG supera los 20 MB, se convierte a JPG.

Uso: \`a!eurobeat\` (con una imagen adjunta o respondiendo a una).`;

function matchesCommand(content) {
  return /^a!eurobeat(?:\s|$)/i.test(content.trim());
}

function isHelp(content) {
  return /^a!eurobeat\s+help\b/i.test(content.trim());
}

function isImageAttachment(attachment) {
  if (!attachment) return false;
  if ((attachment.contentType || '').startsWith('image/')) return true;
  return IMAGE_EXTENSION.test(attachment.name || '');
}

function findImage(message) {
  return [...message.attachments.values()].find(isImageAttachment) || null;
}

async function resolveAttachment(message) {
  const direct = findImage(message);
  if (direct) return direct;

  if (message.reference?.messageId) {
    try {
      const referenced = await message.fetchReference();
      return findImage(referenced);
    } catch {
      return null;
    }
  }

  return null;
}

function toneRow() {
  const buttons = Object.entries(TONES).map(([key, tone]) =>
    new ButtonBuilder()
      .setCustomId(`eurobeat:tone:${key}`)
      .setLabel(tone.label)
      .setStyle(ButtonStyle.Secondary)
  );
  buttons.push(
    new ButtonBuilder()
      .setCustomId('eurobeat:cancel')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
  );
  return new ActionRowBuilder().addComponents(...buttons);
}

function textRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('eurobeat:text:yes')
      .setLabel('Sí, con texto')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('eurobeat:text:no')
      .setLabel('No, sin texto')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('eurobeat:cancel')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
  );
}

function clearState(userId) {
  const state = pending.get(userId);
  if (state?.timer) clearTimeout(state.timer);
  pending.delete(userId);
}

async function renderPreviews(imageBuffer) {
  return Promise.all(
    Object.entries(TONES).map(async ([key, tone]) => {
      const { buffer } = await createCover({
        input: imageBuffer,
        ...buildOptions({ toneKey: key, modeKey: 'full', size: PREVIEW_SIZE }),
      });
      return { key, label: tone.label, buffer };
    })
  );
}

async function renderFinal(state, withText, colorOption = null) {
  const volume = withText ? randomVolume() : null;
  const size = withText
    ? coverSizeFor(state.width, state.height)
    : outputSizeFor(state.width, state.height);

  const options = buildOptions({
    toneKey: state.tone,
    modeKey: withText ? 'cover' : 'full',
    size,
    volume,
  });

  if (colorOption) {
    options.hue = colorOption.hue;
    options.titleColor = colorOption.textColor;
    options.volumeColor = colorOption.textColor;
  }

  if (withText) {
    // Recorte 1:1 sin zoom, intentando centrar la cara con smartcrop.
    // Si la imagen ya es cuadrada, `suggestSquareCrop` devuelve null.
    const suggestedCrop = await suggestSquareCrop(state.imageBuffer, { fallbackFocusY: 0.25 });
    options.crop = suggestedCrop || true;
    options.zoom = 1;
  }

  const result = await createCover({ input: state.imageBuffer, ...options });

  let buffer = result.buffer;
  let extension = 'png';

  if (buffer.length > MAX_UPLOAD_BYTES) {
    buffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    extension = 'jpg';

    if (buffer.length > MAX_UPLOAD_BYTES) {
      buffer = await sharp(buffer).jpeg({ quality: 80 }).toBuffer();
    }
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('La imagen final supera los 20 MB incluso en JPG.');
  }

  const filename = withText
    ? `super-eurobeat-vol${volume}.${extension}`
    : `super-eurobeat-sin-texto.${extension}`;

  return { buffer, filename, volume, width: result.width, height: result.height };
}

async function promptColorSelection(interaction, state, tone, withText) {
  await interaction.editReply({
    content:
      `🎚️ Estilo: **${tone.label}** · Texto: **${withText ? 'SÍ' : 'NO'}**\n` +
      'Elegí el color reaccionando con un emoji en el mensaje de abajo.',
    components: [],
  });

  const channel = interaction.channel?.partial
    ? await interaction.channel.fetch()
    : interaction.channel;

  const colorMessage = await channel.send({
    content: withText ? HUE_PROMPT : HUE_PROMPT_NO_TEXT,
    files: [{ attachment: HUE_REFERENCE, name: 'hue_reference.jpg' }],
  });

  const collector = colorMessage.createReactionCollector({
    filter: (reaction, user) => {
      if (user.bot) return false;
      if (user.id !== state.userId) return false;
      if (pending.get(state.userId) !== state) return false;
      return HUE_OPTIONS.some((option) => option.emoji === reaction.emoji.name);
    },
    time: TTL_MS,
    max: 1,
  });

  // Las reacciones se agregan sin bloquear: el collector ya está escuchando,
  // así que el usuario puede elegir aunque el bot todavía esté agregando emojis.
  for (const option of HUE_OPTIONS) {
    colorMessage
      .react(option.emoji)
      .catch((error) => console.error('Eurobeat: no se pudo agregar la reacción', option.emoji, error.message));
  }

  console.log(`Eurobeat: esperando color de ${state.userId} en ${colorMessage.id}`);

  collector.on('collect', async (reaction) => {
    const option = HUE_OPTIONS.find((item) => item.emoji === reaction.emoji.name);
    if (!option) return;
    console.log(`Eurobeat: color elegido por ${state.userId}: ${option.key}`);

    // Al elegir un color se elimina el mensaje de referencia.
    await colorMessage.delete().catch(() => {});

    try {
      const final = await renderFinal(state, withText, option);
      const detail = withText
        ? `Texto: **SÍ** · \`VOL. ${final.volume}\` · Color: ${option.emoji} ${option.label}`
        : `Texto: **NO** · Color: ${option.emoji} ${option.label}`;
      await interaction.editReply({
        content:
          `✅ **Imagen lista**\n` +
          `Estilo: **${tone.label}** · ${detail}\n` +
          `${final.width}×${final.height}px`,
        files: [{ attachment: final.buffer, name: final.filename }],
        components: [],
      });
    } catch (error) {
      console.error('Eurobeat final render error:', error);
      await interaction
        .editReply({
          content: `❌ ${error.message || 'No se pudo generar la imagen final.'}`,
          components: [],
        })
        .catch(() => {});
    } finally {
      clearState(state.userId);
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time' && pending.get(state.userId) === state) {
      await interaction
        .editReply({
          content: '⏰ Se acabó el tiempo para elegir color. Probá de nuevo con `a!eurobeat`.',
          components: [],
        })
        .catch(() => {});
      clearState(state.userId);
    }
    // Si quedó sin elegir, también se limpia la referencia.
    await colorMessage.delete().catch(() => {});
  });
}

async function execute(message) {
  if (isHelp(message.content)) {
    await message.reply(HELP);
    return;
  }

  const attachment = await resolveAttachment(message);
  if (!attachment) {
    await message.reply(
      '🖼️ Necesito una imagen. Adjuntala y escribí `a!eurobeat`, o respondé a una imagen con el comando.'
    );
    return;
  }

  if (attachment.size && attachment.size > MAX_INPUT_BYTES) {
    await message.reply('❌ La imagen supera los 20 MB. Probá con una versión más liviana.');
    return;
  }

  const now = Date.now();
  const lastRequest = cooldowns.get(message.author.id) || 0;
  if (now - lastRequest < COOLDOWN_MS) {
    await message.reply('⏳ Esperá unos segundos antes de pedir otra edición.');
    return;
  }

  let statusMessage = null;

  try {
    await message.channel.sendTyping();

    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error(`No se pudo descargar la imagen (HTTP ${response.status}).`);

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (imageBuffer.length > MAX_INPUT_BYTES) {
      throw new Error('La imagen supera los 20 MB.');
    }

    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('El archivo no es una imagen válida.');
    }
    if (metadata.width * metadata.height > MAX_PIXELS) {
      throw new Error('La imagen tiene demasiados píxeles.');
    }

    const swapOrientation = [5, 6, 7, 8].includes(metadata.orientation);
    const width = swapOrientation ? metadata.height : metadata.width;
    const height = swapOrientation ? metadata.width : metadata.height;

    cooldowns.set(message.author.id, Date.now());
    clearState(message.author.id);

    statusMessage = await message.reply('🎛️ Generando las 3 previsualizaciones...');

    const variants = await renderPreviews(imageBuffer);
    const sheet = await buildToneSheet(variants);

    const state = {
      userId: message.author.id,
      messageId: statusMessage.id,
      imageBuffer,
      width,
      height,
      tone: null,
      volume: null,
      createdAt: Date.now(),
      timer: null,
    };
    state.timer = setTimeout(() => {
      if (pending.get(message.author.id) === state) pending.delete(message.author.id);
    }, TTL_MS);
    pending.set(message.author.id, state);

    await statusMessage.edit({
      content:
        '🎛️ **Elegí el estilo**\n' +
        'Te muestro la misma foto con 3 configuraciones de luz, saturación y contraste. Después elegís si querés texto.\n' +
        '*El preview es de baja resolución; el render final respeta la resolución original (máx. 4000 px).*',
      files: [{ attachment: sheet, name: 'eurobeat-estilos.png' }],
      components: [toneRow()],
    });
  } catch (error) {
    console.error('Eurobeat execute error:', error);
    const content = `❌ ${error.message || 'No se pudo procesar la imagen.'}`;
    if (statusMessage) {
      await statusMessage.edit({ content, components: [] }).catch(() => {});
    } else {
      await message.reply(content).catch(() => {});
    }
    clearState(message.author.id);
  }
}

async function replyExpired(interaction) {
  await interaction
    .reply({
      content: '⏰ Esta previsualización expiró. Enviá la imagen de nuevo con `a!eurobeat`.',
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => {});
}

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return false;

  const customId = interaction.customId || '';
  if (!customId.startsWith('eurobeat:')) return false;

  const state = pending.get(interaction.user.id);
  if (!state || state.messageId !== interaction.message.id) {
    await replyExpired(interaction);
    return true;
  }

  try {
    if (customId === 'eurobeat:cancel') {
      clearState(interaction.user.id);
      await interaction.update({ content: '❌ Edición cancelada.', components: [] });
      return true;
    }

    if (customId.startsWith('eurobeat:tone:')) {
      const toneKey = customId.split(':')[2];
      if (!TONES[toneKey]) {
        await interaction.reply({ content: '❌ Estilo desconocido.', flags: MessageFlags.Ephemeral });
        return true;
      }

      state.tone = toneKey;
      await interaction.update({
        content:
          `🎚️ Estilo elegido: **${TONES[toneKey].label}**\n\n` +
          '¿Querés que la imagen final lleve texto?\n' +
          'Si sí: `SUPER EUROBEAT` + `VOL. N` (N aleatorio entre 1 y 100).',
        components: [textRow()],
      });
      return true;
    }

    if (customId.startsWith('eurobeat:text:')) {
      if (!state.tone) {
        await interaction.reply({ content: '❌ Elegí primero un estilo.', flags: MessageFlags.Ephemeral });
        return true;
      }

      if (customId !== 'eurobeat:text:yes' && customId !== 'eurobeat:text:no') {
        await interaction.reply({ content: '❌ Opción desconocida.', flags: MessageFlags.Ephemeral });
        return true;
      }

      const withText = customId === 'eurobeat:text:yes';
      const tone = TONES[state.tone];

      await interaction.deferUpdate();

      await promptColorSelection(interaction, state, tone, withText);
      return true;
    }

    await interaction.reply({ content: '❌ Acción desconocida.', flags: MessageFlags.Ephemeral });
    return true;
  } catch (error) {
    console.error('Eurobeat interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '❌ Ocurrió un error procesando la interacción.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
    return true;
  }
}

module.exports = { execute, handleInteraction, matchesCommand };
