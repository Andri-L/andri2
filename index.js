require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { exec } = require('child_process');

const OWNER_ID = '388900482288189451';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- a!ping ---
    if (message.content === 'a!ping') {
        message.reply('Pong! 🏓');
        return;
    }

    // --- a!update (owner only) ---
    if (message.content === 'a!update') {
        if (message.author.id !== OWNER_ID) {
            message.reply('❌ Only the bot owner can use this command.');
            return;
        }

        const statusMsg = await message.reply('🔄 Pulling latest changes from GitHub...');

        exec('git pull && npm install --omit=dev', { cwd: __dirname, timeout: 60000 }, async (error, stdout, stderr) => {
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
});

client.login(process.env.DISCORD_TOKEN);