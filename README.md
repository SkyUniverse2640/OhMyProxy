# OhMyProxy

Postman Claude Proxy -- use Claude Code through Postman Gateway AI.

## Features

- **Anthropic API-compatible proxy** -- drop-in replacement for Claude Code, serves `/v1/messages` with SSE streaming
- **Round-robin token pool** -- multiple Postman access tokens with automatic rotation on rate limits and auth errors
- **Management dashboard** -- React SPA with hash routing, served on the same port (8020)
- **OAuth integration** -- connect Postman accounts via OAuth 2.0 flow to add tokens
- **Tool execution** -- runs Bash, Read, Write, Grep, Glob, Edit, NotebookEdit, WebSearch, WebFetch tools locally
- **Logging** -- request/response logging with dashboard viewer

## Quick Start

```bash
# Install dependencies
bun install

# Build dashboard and CSS
bun run build:dashboard
bun run build:css

# Start the proxy
bun run start
```

Or simply:

```bash
bun install
bun run start   # prestart builds dashboard + CSS automatically
```

## Configuration

Edit `settings.json` in the project root:

```json
{
  "proxy": {
    "port": 8020,
    "host": "127.0.0.1"
  },
  "management_key": "your-dashboard-password",
  "secret_keys": [
    "your-claude-code-api-key"
  ],
  "postman": {
    "base_url": "https://gateway.postman.com",
    "model": "CLAUDE_OPUS_48_BEDROCK",
    "user_id": "54160029",
    "team_id": "15274029",
    "workspace_id": "your-workspace-id"
  },
  "logging": {
    "enabled": true,
    "level": "info"
  }
}
```

### Adding Postman Access Tokens

Two ways:

1. **Dashboard** -- visit `http://127.0.0.1:8020/`, login with your `management_key`, go to Tokens page
2. **OAuth** -- click "Connect Postman" in the dashboard Tokens page, or if configured, use the OAuth flow
3. **Direct API**:
   ```bash
   curl -X POST http://127.0.0.1:8020/tokens \
     -H "Content-Type: application/json" \
     -d '{"label": "My Token", "token": "your-postman-access-token"}'
   ```

### OAuth Setup

Add to `settings.json`:

```json
{
  "oauth": {
    "postman": {
      "client_id": "your-client-id",
      "client_secret": "your-client-secret",
      "redirect_uri": "http://127.0.0.1:8020/oauth/postman/callback"
    }
  }
}
```

## Dashboard

Visit `http://127.0.0.1:8020/` and login with your `management_key`.

Pages:
- **Overview** -- proxy status, active tokens, model info
- **Tokens** -- add, remove, toggle tokens; connect Postman via OAuth
- **Settings** -- view and edit proxy configuration
- **Logs** -- request logs with filtering

## Claude Code Setup

In `.claude/settings.json`:

```json
{
  "apiKeyHelper": "curl -s http://127.0.0.1:8020/v1/models -H 'x-api-key: your-secret-key' > /dev/null && echo 'your-secret-key'"
}
```

Or set the base URL via environment:

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8020
export ANTHROPIC_API_KEY=your-secret-key
```

## Architecture

```
Client (Claude Code)
  → POST /v1/messages (Anthropic API format)
  → ProxyServer (Bun.serve on :8020)
    → authenticates via secret_keys
    → forwards to Postman Gateway AI
    → executes tool calls locally (Bash, File I/O, Search)
    → streams SSE responses back
    → logs all activity

Dashboard (Browser)
  → GET / (SPA with hash router)
  → React 18 + Tailwind 3 + Radix UI + Zustand
  → /management/* REST API (auth via X-Management-Key)
  → /oauth/postman/* (OAuth 2.0 flow)
```

## Build Commands

| Script | Description |
|--------|-------------|
| `bun run start` | Start proxy (builds dashboard + CSS first) |
| `bun run dev` | Start proxy with hot reload |
| `bun run build:css` | Build Tailwind CSS |
| `bun run build:css:min` | Build minified Tailwind CSS |
| `bun run build:dashboard` | Bundle dashboard SPA (minified, 0.56MB) |

## Tech Stack

- **Runtime:** Bun
- **Frontend:** React 18, Tailwind 3, Radix UI, Zustand, Lucide React, Sonner
- **Build:** `bun build` for dashboard, Tailwind CLI for CSS
- **No:** Express, Next.js, Vite, webpack, Node.js
