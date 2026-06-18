# Vestabot (Slack)

A Slack app that lets anyone in your workspace post to a Vestaboard. Supports two slash commands:

- `/vesta [message]` — post any text to the Vestaboard (rate-limited to once per minute per user)
- `/tides` — post today's high and low tide times for Cohasset Harbor to the Vestaboard

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- A [Slack app](https://api.slack.com/apps) with Socket Mode enabled
- A Vestaboard Read/Write API token (Vestaboard app → Settings → Developer)

## Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From scratch**.

2. **Enable Socket Mode** (Settings → Socket Mode → Enable). This avoids needing a public URL.
   - Generate an **App-Level Token** with the `connections:write` scope → save it as `SLACK_APP_TOKEN`.

3. **Add Slash Commands** (Features → Slash Commands → Create New Command). Add both:

   | Command | Short Description | Usage Hint |
   |---|---|---|
   | `/vesta` | Post a message to the Vestaboard | `[your message]` |
   | `/tides` | Post today's Cohasset tide chart to the Vestaboard | |

   Leave Request URL blank for both — Socket Mode handles routing.

4. **Set OAuth Scopes** (Features → OAuth & Permissions → Bot Token Scopes):
   - `commands`
   - `chat:write`

5. **Install the app** to your workspace (OAuth & Permissions → Install to Workspace).
   - Copy the **Bot User OAuth Token** → save it as `SLACK_BOT_TOKEN`.

6. Copy the **Signing Secret** (Basic Information → App Credentials) → save it as `SLACK_SIGNING_SECRET`.

## Installation

1. Clone and install dependencies:

   ```bash
   git clone <your-repo-url>
   cd vestabot-slack
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

   | Variable | Required | Where to find it |
   |---|---|---|
   | `SLACK_BOT_TOKEN` | Yes | OAuth & Permissions → Bot User OAuth Token (`xoxb-...`) |
   | `SLACK_SIGNING_SECRET` | Yes | Basic Information → App Credentials → Signing Secret |
   | `SLACK_APP_TOKEN` | Yes | Basic Information → App-Level Tokens (`xapp-...`) |
   | `VESTABOARD_TOKEN` | Yes | Vestaboard app → Settings → Developer → Read/Write API token |
   | `TIDE_STATION` | No | NOAA station ID for `/tides` (defaults to `8444762` — Cohasset Harbor) |

## Running

```bash
node index.js
```

You should see:
```
⚡ Vestabot (Slack) is running!
```

- `/vesta Your message here` — posts text to the Vestaboard
- `/tides` — fetches today's tide predictions from NOAA and posts a formatted chart to the Vestaboard

## Running in Docker

**Build:**
```bash
docker build -t vestabot-slack .
```

**Run:**
```bash
docker run -d --restart unless-stopped --env-file .env --name vestabot-slack vestabot-slack
```

**Rebuild after changes:**
```bash
docker build -t vestabot-slack . && docker rm -f vestabot-slack && docker run -d --restart unless-stopped --env-file .env --name vestabot-slack vestabot-slack
```

**Useful commands:**
```bash
docker logs vestabot-slack   # view logs
docker restart vestabot-slack
docker stop vestabot-slack
```
