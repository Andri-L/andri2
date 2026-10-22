require('dotenv').config();
const { Client, GatewayIntentBits, Partials, MessageFlags } = require('discord.js');
const { exec } = require('child_process');
const promptCmd = require('./commands/prompt');
const resetCmd = require('./commands/reset');
const voiceresetCmd = require('./commands/voicereset');
const eurobeatCmd = require('./commands/eurobeat');

const OWNER_ID = '388900482288189451';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- a!eurobeat (servidor y DM) ---
    if (eurobeatCmd.matchesCommand(message.content)) {
        await eurobeatCmd.execute(message);
        return;
    }

    if (!message.guild) {
        if (message.content === 'a!reset') {
            await resetCmd.execute(message);
            return;
        }
        if (message.content === 'a!voicereset') {
            await voiceresetCmd.execute(message);
            return;
        }
        await promptCmd.execute(message);
        return;
    }

    // --- a!ping ---
    if (message.content === 'a!ping') {
        const sent = await message.reply('🏓 Pinging...');
        const roundTrip = sent.createdTimestamp - message.createdTimestamp;
        await sent.edit(`🏓 Pong! **${roundTrip}ms** (API) | **${client.ws.ping}ms** (WebSocket)`);
        return;
    }

    // --- @mention → GoAgent ---
    if (message.mentions.has(client.user)) {
        await promptCmd.execute(message);
        return;
    }

    // --- a!reset ---
    if (message.content === 'a!reset') {
        await resetCmd.execute(message);
        return;
    }

    // --- a!voicereset ---
    if (message.content === 'a!voicereset') {
        await voiceresetCmd.execute(message);
        return;
    }

    // --- a!update (owner only) ---
    if (message.content === 'a!update') {
        if (message.author.id !== OWNER_ID) {
            message.reply('❌ Only the bot owner can use this command.');
            return;
        }

        const statusMsg = await message.reply('🔄 Pulling latest changes from GitHub...');

        exec('git pull && (pnpm install --frozen-lockfile 2>&1 || true)', { cwd: __dirname, timeout: 60000 }, async (error, stdout, stderr) => {
            if (error) {
                const errOutput = (stderr || error.message).slice(0, 1500);
                await statusMsg.edit(`❌ Update failed:\n\`\`\`\n${errOutput}\n\`\`\``);
                return;
            }

            const output = stdout.slice(0, 1500);
            await statusMsg.edit(`✅ Update complete:\n\`\`\`\n${output}\n\`\`\`\n🔁 Restarting in 2 seconds...`);

            setTimeout(() => process.exit(0), 2000);
        });
        return;
    }

    // --- a!model (owner only) ---
    if (message.content.startsWith('a!model ')) {
        if (message.author.id !== OWNER_ID) {
            message.reply('❌ Only the bot owner can use this command.');
            return;
        }

        const modelName = message.content.replace('a!model ', '').trim();
        if (!modelName) {
            message.reply('❌ Please specify a model (e.g. `a!model llama-3.3-70b-versatile`)');
            return;
        }

        // Validate model name to prevent shell injection
        if (!/^[a-zA-Z0-9_.:\/\-]+$/.test(modelName)) {
            message.reply('❌ Invalid model name. Use only letters, numbers, hyphens, dots, and underscores.');
            return;
        }

        const statusMsg = await message.reply(`🔄 Switching LLM model to **${modelName}** and restarting GoAgent...`);

        const script = `sudo sed -i 's|^MODEL_NAME=.*|MODEL_NAME=${modelName}|' /opt/goagent/.env && sudo systemctl restart goagent`;

        exec(script, { timeout: 30000 }, async (error, stdout, stderr) => {
            if (error) {
                const errOutput = (stderr || error.message).slice(0, 1500);
                await statusMsg.edit(`❌ Failed to switch model:\n\`\`\`bash\n${errOutput}\n\`\`\``);
                return;
            }
            await statusMsg.edit(`✅ LLM model switched to **${modelName}**. GoAgent restarted.`);
        });
        return;
    }
});

client.on('interactionCreate', async (interaction) => {
    try {
        await eurobeatCmd.handleInteraction(interaction);
    } catch (error) {
        console.error('Interaction error:', error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction
                .reply({ content: '❌ Error procesando la interacción.', flags: MessageFlags.Ephemeral })
                .catch(() => {});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
