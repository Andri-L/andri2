const GOAGENT_URL = process.env.GOAGENT_URL || 'http://localhost:8081';

async function execute(message) {
    const prompt = message.content;

    // Show typing indicator while GoAgent processes
    await message.channel.sendTyping();

    try {
        const response = await fetch(`${GOAGENT_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: message.author.id,
                prompt: prompt,
            }),
            signal: AbortSignal.timeout(120000), // 2 min timeout
        });

        if (!response.ok) {
            message.reply(`❌ GoAgent returned status ${response.status}`);
            return;
        }

        const data = await response.json();

        if (data.error) {
            message.reply(`❌ GoAgent error: ${data.error.slice(0, 500)}`);
            return;
        }

        const answer = data.response || 'No response received.';

        // Discord has a 2000 char limit — split if needed
        if (answer.length <= 2000) {
            message.reply(answer);
        } else {
            const chunks = answer.match(/[\s\S]{1,1990}/g);
            for (const chunk of chunks) {
                await message.channel.send(chunk);
            }
        }
    } catch (err) {
        if (err.name === 'TimeoutError') {
            message.reply('❌ GoAgent took too long to respond (>2 min).');
        } else {
            message.reply('❌ Could not reach GoAgent. Is it running?');
            console.error('GoAgent error:', err.message);
        }
    }
}

module.exports = { execute };
