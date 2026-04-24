require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { exec } = require('child_process');
const promptCmd = require('./commands/prompt');
const resetCmd = require('./commands/reset');

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
            message.reply('❌ Please specify a model (e.g. `a!model bonsai-1.7B_q1_0.gguf`)');
            return;
        }

        const statusMsg = await message.reply(`🔄 Changing model to **${modelName}** and restarting services... This will take ~20 seconds.`);

        const script = `
sudo bash -c 'cat > /etc/systemd/system/llama-server.service' << 'EOF'
[Unit]
Description=llama.cpp Server
After=network.target

[Service]
Type=simple
ExecStart=/opt/llama.cpp/build/bin/llama-server --host 127.0.0.1 --port 8080 --model /opt/llama.cpp/models/${modelName} --ctx-size 8192 --batch-size 1024 --threads 4 --n-gpu-layers 0
WorkingDirectory=/opt/llama.cpp
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl restart llama-server
sleep 2
sleep 15
sudo systemctl restart goagent
`;

        exec(script, { timeout: 60000 }, async (error, stdout, stderr) => {
            if (error) {
                const errOutput = (stderr || error.message).slice(0, 1500);
                await statusMsg.edit(`❌ Failed to switch model:\n\`\`\`bash\n${errOutput}\n\`\`\``);
                return;
            }
            await statusMsg.edit(`✅ Model successfully switched to **${modelName}**! Both \`llama-server\` and \`goagent\` have been restarted.`);
        });
        return;
    }
});

client.login(process.env.DISCORD_TOKEN);