# Single Port 8020 + OAuth Design

**Date:** 2026-06-12
**Status:** Approved

## Goals

1. Merge proxy (8020) + dashboard (3020) → single port 8020
2. Rewrite dashboard from Next.js → Bun Native React SPA
3. Add OAuth "Connect Postman Account" to token pool

## Architecture

```
ProxyServer (Bun.serve port 8020)
├─ /v1/messages             → Anthropic SSE proxy (existing)
├─ /v1/models               → Model list (existing)
├─ /v1/context              → Context clear (existing)
├─ /tokens/*                → Token CRUD (existing)
├─ /management/*            → Management REST API (existing)
├─ /oauth/postman/login     → GET redirect to Postman OAuth
├─ /oauth/postman/callback  → GET exchange code → token
└─ /*                       → Dashboard SPA (static HTML/TSX)
```

## OAuth Flow

1. User clicks "Connect Postman Account" in dashboard (needs management key auth)
2. Frontend calls `POST /oauth/postman/login` → returns `{ url: "https://api.getpostman.com/oauth2/authorize?..." }`
3. Frontend opens Postman OAuth URL in popup/new tab
4. User authorizes, Postman redirects to `/oauth/postman/callback?code=xxx`
5. Server exchanges code for access token, calls `/me` for user info
6. Token added to `list_access_token.json` via `TokenManager.add()`
7. UI shows success, token immediately in round-robin pool

## OAuth Config

```json
// settings.json (new fields)
{
  "oauth": {
    "postman": {
      "client_id": "",
      "client_secret": "",
      "redirect_uri": "http://127.0.0.1:8020/oauth/postman/callback"
    }
  }
}
```

## Dashboard Rewrite

### Structure
```
src/dashboard/
├── index.html           # Entry point, loads app.tsx
├── app.tsx              # Root React + hash router
├── pages/
│   ├── Login.tsx
│   ├── Status.tsx
│   ├── Tokens.tsx       # Includes "Connect Postman" button
│   ├── Settings.tsx
│   └── Logs.tsx
├── components/          # Copied from dashboard/components (adjusted imports)
├── hooks/               # Adjusted: remove proxyUrl, use relative paths
├── store/               # Simplified auth-store (no proxyUrl)
└── lib/
    ├── api-client.ts    # Relative URLs (/management/...)
    ├── types.ts         # Unchanged
    └── utils.ts         # Unchanged
```

### Router
- Simple hash-based client router (`#/dashboard`, `#/dashboard/tokens`, etc.)
- `app.tsx` renders page based on `window.location.hash`

### Auth
- Dashboard auth: management key (unchanged)
- Login page: enter management key → verify via `GET /management/status` → store in Zustand (persisted)

## Token Round-Robin
- Existing `TokenManager.rotate()` already round-robins on 429/401
- OAuth-added tokens treated same as manually-added tokens
- No changes to TokenManager needed

## Implementation Order

1. Add `/oauth/*` routes to ProxyServer
2. Add OAuth config to settings.json
3. Rewrite dashboard as Bun Native SPA
4. Update `Bun.serve()` to serve dashboard static files
5. Remove old Next.js dashboard
6. Test: single port 8020, OAuth flow, round-robin
