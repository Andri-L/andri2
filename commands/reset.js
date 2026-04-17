const GOAGENT_URL = process.env.GOAGENT_URL || 'http://localhost:8081';

async function execute(message) {
    try {
        const response = await fetch(`${GOAGENT_URL}/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: message.author.id }),
        });

        if (response.ok) {
            message.reply('🧹 Your conversation history has been cleared.');
        } else {
            message.reply('❌ Failed to reset session.');
        }
    } catch {
        message.reply('❌ Could not reach GoAgent. Is it running?');
    }
}

module.exports = { execute };
