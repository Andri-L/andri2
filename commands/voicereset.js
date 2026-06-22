const GOAGENT_URL = process.env.GOAGENT_URL || 'http://localhost:8080';

async function execute(message) {
    try {
        const response = await fetch(`${GOAGENT_URL}/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: 'voice' }),
        });

        if (response.ok) {
            message.reply('🎤 Voice session has been reset.');
        } else {
            message.reply('❌ Failed to reset voice session.');
        }
    } catch {
        message.reply('❌ Could not reach GoAgent. Is it running?');
    }
}

module.exports = { execute };
