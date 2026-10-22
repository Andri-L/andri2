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
| `a!voicereset` | Server / DM | Clear the voice (BMO) conversation history |
| `a!eurobeat` | Server / DM | Edit an attached image with the Super Eurobeat style |
| `@mention` | Server | Ask the AI a question |
| DM (any text) | DM | Chat with the AI privately |
| `a!update` | Owner | Git pull + restart the bot |
| `a!model <name>` | Owner | Switch the LLM model (updates GoAgent's `.env`) |

## Eurobeat Image Editor

`a!eurobeat` processes an image with the pipeline vendored in `services/eurobeat/`. The Andri2 deployment does **not** need the external `IMG-TO-EUROBEAT` project.

Usage:

```text
a!eurobeat
```

Attach an image to the message, reply to an image, mention a user (`a!eurobeat @user`) or pass their ID (`a!eurobeat 123456789012345678`) to use their avatar. The bot then:

1. Generates a low-resolution comparison sheet with three style presets: **Clara**, **Baja saturación** and **Contraste** (chosen after the 5×5 tone/saturation grids in `IMG-TO-EUROBEAT`).
2. Lets the user choose one with buttons.
3. Asks whether the final image should include text.
4. Whether the user chooses text or no text, the bot posts `hue_reference.jpg` with 9 color examples and the user picks one by reacting with the matching emoji:
   `🍏 Menta`, `🥝 Lima`, `🍋 Amarillo`, `🍊 Naranja`, `🍓 Rojo`, `🌸 Rosa`, `🍒 Magenta`, `🍇 Morado`, `🫐 Azul`.
5. With text: crops to 1:1 without extra zoom, tries to center the face with the lightweight `smartcrop` algorithm, and adds `SUPER EUROBEAT` plus a random `VOL. N` (N between 1 and 100) in the chosen color. If no face/region is detected, it falls back to a centered crop.
6. Without text: returns the full image without cropping or typography, but with the chosen hue applied to the photo tint.
7. Keeps the original resolution: the full image is capped at 4000 px on the longest side; the square cover uses the original shorter side (also capped at 4000 px).

Limits and behavior:

- One active preview per user, valid for 15 minutes.
- 20-second cooldown between requests.
- Input images up to 20 MB.
- The full pipeline, fonts and preview logic live in `services/eurobeat/`.
- If the final PNG exceeds 20 MB, it is converted to JPEG automatically.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | **Yes** | — | Discord bot token |
| `GOAGENT_URL` | No | `http://localhost:8080` | GoAgent server URL |

## Setup

Requires Node.js 18.17+ (Node 20+ recommended).

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

This repository has no GitHub Actions/CI workflow, so updates are deployed manually:

```bash
cd /home/ubuntu/projects/andri2
git pull
pnpm install --frozen-lockfile
sudo systemctl restart andri2
sudo systemctl status andri2 --no-pager
```

## Related Projects

- [GoAgent](https://github.com/Andri-L/GoAgent) — AI agent server (Go)
- [ESP32-AI-Terminal](https://github.com/Andri-L/ESP32-AI-Terminal) — Physical voice interface (BMO)
