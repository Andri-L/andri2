# Andri2 — Discord Bot

Discord bot that acts as a front-end gateway to **GoAgent** (the AI agent server). Users send messages in Discord, and the bot forwards them to GoAgent's REST API and returns the LLM-generated response.

## Architecture

```
Discord User ──▶ Andri2 (Discord Bot) ──POST /chat──▶ GoAgent ──▶ Groq / OpenAI-compatible LLM
                       │                                      │
                       ◀──────────── JSON response ────────────┘
```

The bot is **LLM-agnostic** — GoAgent handles all LLM communication. To switch from local llama.cpp to Groq or any other OpenAI-compatible API, just reconfigure GoAgent (see its README). The bot needs no changes.

## Commands

| Command | Scope | Description |
|---------|-------|-------------|
| `a!ping` | Server | Check bot latency |
| `a!reset` | Server / DM | Clear your conversation history |
| `@mention` | Server | Ask the AI a question |
| DM (any text) | DM | Chat with the AI privately |
| `a!update` | Owner | Git pull + restart the bot |
| `a!model <name>` | Owner | Switch the LLM model (updates GoAgent's `.env`) |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | **Yes** | — | Discord bot token |
| `GOAGENT_URL` | No | `http://localhost:8080` | GoAgent server URL |

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create .env from template
cp .env.example .env
# Edit .env with your DISCORD_TOKEN and GOAGENT_URL

# 3. Run
pnpm start
```

## Deployment

Runs as a systemd service on the same VPS as GoAgent:

```bash
sudo cp deploy/andri2.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now andri2
```

## Related Projects

- [GoAgent](https://github.com/Andri-L/GoAgent) — AI agent server (Go)
- [ESP32-AI-Terminal](https://github.com/Andri-L/ESP32-AI-Terminal) — Physical voice interface (BMO)
