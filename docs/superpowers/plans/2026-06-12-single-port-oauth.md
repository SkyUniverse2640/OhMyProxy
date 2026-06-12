# Single Port 8020 + OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge proxy + management dashboard on port 8020, rewrite dashboard as Bun Native React SPA, add Postman OAuth token collection.

**Architecture:** Single Bun.serve() on port 8020 serves Anthropic proxy API, management REST API, OAuth endpoints, and dashboard SPA. Dashboard is React 18 + Tailwind 3 + Radix UI with hash-based client router. OAuth uses Postman OAuth 2.0 flow to add tokens to round-robin pool.

**Tech Stack:** Bun, React 18, Tailwind 3, Radix UI, Zustand, Lucide React, Sonner, clsx, tailwind-merge, class-variance-authority

---

## File Structure

```
New:
  src/OAuthHandler.ts           — OAuth flow logic
  src/dashboard/index.html      — Entry HTML
  src/dashboard/index.css       — Tailwind source
  src/dashboard/app.tsx         — Root React + hash router
  src/dashboard/lib/api-client.ts
  src/dashboard/lib/types.ts
  src/dashboard/lib/utils.ts
  src/dashboard/store/auth-store.ts
  src/dashboard/hooks/use-status.ts
  src/dashboard/hooks/use-tokens.ts
  src/dashboard/hooks/use-settings.ts
  src/dashboard/hooks/use-logs.ts
  src/dashboard/components/ui/*.tsx   (11 files)
  src/dashboard/components/status-card.tsx
  src/dashboard/components/token-table.tsx
  src/dashboard/components/settings-form.tsx
  src/dashboard/components/log-viewer.tsx
  src/dashboard/components/sidebar-nav.tsx
  src/dashboard/components/add-token-dialog.tsx
  src/dashboard/components/confirm-dialog.tsx
  src/dashboard/pages/Login.tsx
  src/dashboard/pages/Status.tsx
  src/dashboard/pages/Tokens.tsx
  src/dashboard/pages/Settings.tsx
  src/dashboard/pages/Logs.tsx
  tailwind.config.ts            — Tailwind config at root

Modified:
  src/ProxyServer.ts            — Add OAuth routes, dashboard serving, Tailwind build
  src/types.ts                  — Add OAuthConfig
  package.json                  — Merge dashboard deps, add build scripts
  settings.json                 — Add oauth config block
```

---

### Task 1: Merge Dependencies & Tailwind Config

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.ts`

Merge dashboard deps into root package.json. Add Tailwind config.

- [ ] **Step 1: Update package.json with merged dependencies**

Read current `package.json`, add all dashboard deps plus tailwindcss.

```json
{
  "name": "postman-claude-proxy",
  "version": "1.0.0",
  "description": "Proxy: Claude Code → Postman Gateway AI (localhost:8020)",
  "module": "index.ts",
  "type": "module",
  "scripts": {
    "start": "bun run index.ts",
    "dev": "bun --watch index.ts",
    "build:css": "bunx tailwindcss -i ./src/dashboard/index.css -o ./src/dashboard/output.css",
    "build:css:min": "bunx tailwindcss -i ./src/dashboard/index.css -o ./src/dashboard/output.css --minify",
    "prestart": "bun run build:css",
    "predev": "bun run build:css"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.16",
    "@radix-ui/react-label": "^2.1.9",
    "@radix-ui/react-scroll-area": "^1.2.11",
    "@radix-ui/react-select": "^2.3.0",
    "@radix-ui/react-separator": "^1.1.9",
    "@radix-ui/react-slot": "^1.2.5",
    "@radix-ui/react-switch": "^1.3.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "sonner": "^2.0.3",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "zustand": "^5.0.5"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.0.0"
  },
  "private": true
}
```

- [ ] **Step 2: Create tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/dashboard/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

- [ ] **Step 3: Install dependencies**

```bash
bun install
```

Expected: all packages installed successfully.

- [ ] **Step 4: Commit**

```bash
git add package.json tailwind.config.ts bun.lock
git commit -m "build: merge dashboard deps, add tailwind config"
```

---

### Task 2: Add OAuth Types & Config

**Files:**
- Modify: `src/types.ts`
- Modify: `settings.json` (if exists at root)

- [ ] **Step 1: Add OAuthConfig to types.ts**

Add to `src/types.ts` after the existing types:

```typescript
export interface OAuthConfig {
  postman: {
    client_id: string;
    client_secret: string;
    redirect_uri: string;
  };
}
```

Also add `oauth?: OAuthConfig` to the `Settings` interface:

In `Settings` interface, add after `management_key?: string`:
```typescript
  oauth?: OAuthConfig;
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add OAuthConfig interface"
```

---

### Task 3: Create OAuthHandler

**Files:**
- Create: `src/OAuthHandler.ts`

- [ ] **Step 1: Create OAuthHandler class**

```typescript
import type { Settings, AccessToken, OAuthConfig } from "./types";
import type { Config } from "./Config";
import type { TokenManager } from "./TokenManager";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Management-Key",
};

interface PostmanUserInfo {
  user: {
    id: string;
    username: string;
    email: string;
  };
}

export class OAuthHandler {
  private oauth: OAuthConfig | undefined;

  constructor(
    private readonly config: Config,
    private readonly tokens: TokenManager,
  ) {
    const settings = config.loadSettings();
    this.oauth = settings.oauth;
  }

  private reloadOAuthConfig(): void {
    const settings = this.config.loadSettings();
    this.oauth = settings.oauth;
  }

  isConfigured(): boolean {
    this.reloadOAuthConfig();
    return !!(this.oauth?.postman.client_id && this.oauth.postman.client_secret);
  }

  async handle(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Generate login URL (POST so frontend can trigger it)
    if (path === "/oauth/postman/login" && req.method === "POST") {
      return this.getLoginUrl();
    }

    // Callback from Postman
    if (path === "/oauth/postman/callback" && req.method === "GET") {
      return this.handleCallback(url);
    }

    return null;
  }

  private getLoginUrl(): Response {
    if (!this.isConfigured()) {
      return this.json(
        { error: "OAuth not configured. Set oauth.postman in settings.json" },
        500,
      );
    }

    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: this.oauth!.postman.client_id,
      response_type: "code",
      redirect_uri: this.oauth!.postman.redirect_uri,
      scope: "read write",
      state,
    });

    return this.json({
      url: `https://api.getpostman.com/oauth2/authorize?${params.toString()}`,
      state,
    });
  }

  private async handleCallback(url: URL): Promise<Response> {
    this.reloadOAuthConfig();

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      const msg = error || "No authorization code received";
      return this.htmlResponse("error", msg);
    }

    if (!this.oauth?.postman.client_id || !this.oauth.postman.client_secret) {
      return this.htmlResponse("error", "OAuth not configured on server");
    }

    // Exchange code for access token
    let tokenResponse: any;
    try {
      const resp = await fetch("https://api.getpostman.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: this.oauth.postman.client_id,
          client_secret: this.oauth.postman.client_secret,
          redirect_uri: this.oauth.postman.redirect_uri,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return this.htmlResponse("error", `Token exchange failed: ${resp.status} - ${errText.slice(0, 200)}`);
      }

      tokenResponse = await resp.json();
    } catch (e: any) {
      return this.htmlResponse("error", `Token exchange error: ${e.message}`);
    }

    const accessToken: string = tokenResponse.access_token;

    // Get user info for label
    let userInfo: PostmanUserInfo | null = null;
    try {
      const resp = await fetch("https://api.getpostman.com/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (resp.ok) {
        userInfo = await resp.json() as PostmanUserInfo;
      }
    } catch {
      // User info fetch is optional
    }

    const label = userInfo?.user?.username
      ? `Postman: ${userInfo.user.username}`
      : `Postman OAuth ${Date.now()}`;

    // Add token to pool
    this.tokens.add({
      label,
      token: accessToken,
      active: true,
      note: userInfo?.user?.email ?? "",
    });

    return this.htmlResponse("success", `Token added: ${label}`);
  }

  private htmlResponse(status: "success" | "error", message: string): Response {
    const color = status === "success" ? "#22c55e" : "#ef4444";
    const icon = status === "success" ? "✓" : "✗";
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Postman OAuth - ${status === "success" ? "Success" : "Error"}</title>
  <style>
    body { font-family: system-ui; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0a0a0f; color: #e2e8f0; }
    .card { text-align: center; padding: 2rem; border: 1px solid #1e293b; border-radius: 0.5rem; max-width: 400px; }
    .icon { font-size: 3rem; color: ${color}; }
    h2 { margin: 1rem 0 0.5rem; }
    p { color: #94a3b8; font-size: 0.9rem; }
    button { margin-top: 1rem; padding: 0.5rem 1.5rem; border: 1px solid #334155; border-radius: 0.375rem; background: transparent; color: inherit; cursor: pointer; font-size: 0.9rem; }
    button:hover { background: #1e293b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h2>${status === "success" ? "Connected!" : "Error"}</h2>
    <p>${message}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`;
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  private json(data: object, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/OAuthHandler.ts
git commit -m "feat: add OAuthHandler for Postman OAuth token collection"
```

---

### Task 4: Integrate OAuth into ProxyServer

**Files:**
- Modify: `src/ProxyServer.ts`

- [ ] **Step 1: Import OAuthHandler and add to constructor**

Add import at top:
```typescript
import { OAuthHandler } from "./OAuthHandler";
```

Add field and init in constructor (after `this.management` line):
```typescript
    private readonly oauth: OAuthHandler;

    constructor(private readonly config: Config) {
        // ... existing code ...
        this.management = new ManagementHandler(config, this.tokens);
        this.oauth = new OAuthHandler(config, this.tokens);
    }
```

- [ ] **Step 2: Add OAuth routes to handle() method**

In `handle()` method, add after the management line (`const mgmtResponse = ...`):

```typescript
        // OAuth endpoints (public, no management key required)
        const oauthResponse = await this.oauth.handle(req);
        if (oauthResponse) return oauthResponse;
```

- [ ] **Step 3: Commit**

```bash
git add src/ProxyServer.ts
git commit -m "feat(proxy): integrate OAuth routes into ProxyServer"
```

---

### Task 5: Create Dashboard CSS & Entry HTML

**Files:**
- Create: `src/dashboard/index.css`
- Create: `src/dashboard/index.html`

- [ ] **Step 1: Create index.css with Tailwind directives**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 2: Create index.html entry point**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OhMyProxy Dashboard</title>
  <link rel="stylesheet" href="./output.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./app.tsx"></script>
</body>
</html>
```

- [ ] **Step 3: Build CSS**

```bash
bunx tailwindcss -i ./src/dashboard/index.css -o ./src/dashboard/output.css
```

Expected: `output.css` created. If `tailwindcss` CLI errors, try: `bun run build:css`

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/index.css src/dashboard/index.html src/dashboard/output.css
git commit -m "feat(dashboard): add entry HTML and Tailwind CSS"
```

---

### Task 6: Create Dashboard Lib Files

**Files:**
- Create: `src/dashboard/lib/types.ts`
- Create: `src/dashboard/lib/utils.ts`
- Create: `src/dashboard/lib/api-client.ts`

- [ ] **Step 1: Create types.ts (copy from dashboard/lib/types.ts, unmodified)**

Same content as existing `dashboard/lib/types.ts` — no changes needed, imports are self-contained.

- [ ] **Step 2: Create utils.ts (copy from dashboard/lib/utils.ts, unmodified)**

Same content as existing `dashboard/lib/utils.ts` — no changes needed.

- [ ] **Step 3: Create api-client.ts with relative URLs**

```typescript
import { useAuthStore } from "../store/auth-store";

class ApiClient {
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Management-Key": useAuthStore.getState().managementKey,
    };
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = {
      ...this.getHeaders(),
      ...(options.headers as Record<string, string> || {}),
    };

    const res = await fetch(path, { ...options, headers });

    if (res.status === 401) {
      useAuthStore.getState().logout();
      window.location.hash = "#/login";
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  async getStatus() {
    return this.request<import("./types").ProxyStatus>("/management/status");
  }

  async getSettings() {
    return this.request<import("./types").ProxySettings>("/management/settings");
  }

  async patchSettings(body: Record<string, unknown>) {
    return this.request<{ message: string; updated: string[] }>(
      "/management/settings",
      { method: "PATCH", body: JSON.stringify(body) }
    );
  }

  async getTokens() {
    return this.request<import("./types").TokenItem[]>("/management/tokens");
  }

  async addToken(payload: import("./types").TokenCreatePayload) {
    return this.request<{ message: string; id: number }>(
      "/management/tokens",
      { method: "POST", body: JSON.stringify(payload) }
    );
  }

  async deleteToken(id: number) {
    return this.request<{ message: string }>(
      `/management/tokens/${id}`,
      { method: "DELETE" }
    );
  }

  async toggleToken(id: number) {
    return this.request<{ message: string; active: boolean }>(
      `/management/tokens/${id}/toggle`,
      { method: "PATCH" }
    );
  }

  async getLogs() {
    return this.request<import("./types").LogsResponse>("/management/logs");
  }

  async deleteLogs() {
    return this.request<{ message: string }>(
      "/management/logs",
      { method: "DELETE" }
    );
  }

  // OAuth
  async getOAuthLoginUrl(): Promise<{ url: string; state: string }> {
    return this.request("/oauth/postman/login", { method: "POST" });
  }
}

export const apiClient = new ApiClient();
```

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/lib/
git commit -m "feat(dashboard): add lib files (api-client, types, utils)"
```

---

### Task 7: Create Auth Store

**Files:**
- Create: `src/dashboard/store/auth-store.ts`

- [ ] **Step 1: Create simplified auth store (no proxyUrl)**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  managementKey: string;
  isAuthenticated: boolean;
  setCredentials: (managementKey: string) => void;
  login: () => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      managementKey: "",
      isAuthenticated: false,

      setCredentials: (managementKey: string) => {
        set({ managementKey });
      },

      login: async () => {
        const { managementKey } = get();
        try {
          const res = await fetch("/management/status", {
            headers: { "X-Management-Key": managementKey },
          });
          if (res.ok) {
            set({ isAuthenticated: true });
            return true;
          }
          set({ isAuthenticated: false });
          return false;
        } catch {
          set({ isAuthenticated: false });
          return false;
        }
      },

      logout: () => {
        set({ isAuthenticated: false, managementKey: "" });
      },
    }),
    {
      name: "ohmyproxy-auth",
    }
  )
);
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/store/
git commit -m "feat(dashboard): add auth store (zustand, no proxyUrl)"
```

---

### Task 8: Copy UI Components

**Files:**
- Create: `src/dashboard/components/ui/button.tsx`
- Create: `src/dashboard/components/ui/card.tsx`
- Create: `src/dashboard/components/ui/dialog.tsx`
- Create: `src/dashboard/components/ui/input.tsx`
- Create: `src/dashboard/components/ui/label.tsx`
- Create: `src/dashboard/components/ui/badge.tsx`
- Create: `src/dashboard/components/ui/switch.tsx`
- Create: `src/dashboard/components/ui/table.tsx`
- Create: `src/dashboard/components/ui/select.tsx`
- Create: `src/dashboard/components/ui/skeleton.tsx`
- Create: `src/dashboard/components/ui/scroll-area.tsx`
- Create: `src/dashboard/components/ui/separator.tsx`

- [ ] **Step 1: Copy all 11 UI component files**

Copy each file from `dashboard/components/ui/*.tsx` to `src/dashboard/components/ui/*.tsx` with one change: replace `@/lib/utils` import with `../../lib/utils`.

For each file `dashboard/components/ui/X.tsx` → `src/dashboard/components/ui/X.tsx`:

Change:
```typescript
import { cn } from "@/lib/utils";
```
To:
```typescript
import { cn } from "../../lib/utils";
```

All other code is unchanged. Remove `"use client"` directive (not needed outside Next.js).

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/components/ui/
git commit -m "feat(dashboard): copy UI components with adjusted imports"
```

---

### Task 9: Create Hooks

**Files:**
- Create: `src/dashboard/hooks/use-status.ts`
- Create: `src/dashboard/hooks/use-tokens.ts`
- Create: `src/dashboard/hooks/use-settings.ts`
- Create: `src/dashboard/hooks/use-logs.ts`

- [ ] **Step 1: Copy all 4 hooks**

Copy from `dashboard/hooks/*.ts` to `src/dashboard/hooks/*.ts`. Change import:

```typescript
import { apiClient } from "@/lib/api-client";
```
To:
```typescript
import { apiClient } from "../lib/api-client";
```

And:
```typescript
import type { ProxyStatus } from "@/lib/types";
```
To:
```typescript
import type { ProxyStatus } from "../lib/types";
```

All other code unchanged. Remove `"use client"` directive.

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/hooks/
git commit -m "feat(dashboard): add hooks with adjusted imports"
```

---

### Task 10: Create Business Components

**Files:**
- Create: `src/dashboard/components/status-card.tsx`
- Create: `src/dashboard/components/token-table.tsx`
- Create: `src/dashboard/components/settings-form.tsx`
- Create: `src/dashboard/components/log-viewer.tsx`
- Create: `src/dashboard/components/sidebar-nav.tsx`
- Create: `src/dashboard/components/add-token-dialog.tsx`
- Create: `src/dashboard/components/confirm-dialog.tsx`

- [ ] **Step 1: Copy all 7 business components with adjusted imports**

Copy each from `dashboard/components/` to `src/dashboard/components/`. Adjust imports:

| Old Import | New Import |
|---|---|
| `@/components/ui/button` | `./ui/button` |
| `@/components/ui/card` | `./ui/card` |
| `@/components/ui/dialog` | `./ui/dialog` |
| `@/components/ui/input` | `./ui/input` |
| `@/components/ui/label` | `./ui/label` |
| `@/components/ui/table` | `./ui/table` |
| `@/components/ui/badge` | `./ui/badge` |
| `@/components/ui/switch` | `./ui/switch` |
| `@/components/ui/select` | `./ui/select` |
| `@/components/ui/skeleton` | `./ui/skeleton` |
| `@/components/ui/scroll-area` | `./ui/scroll-area` |
| `@/lib/api-client` | `../lib/api-client` |
| `@/lib/types` | `../lib/types` |
| `@/lib/utils` | `../lib/utils` |
| `@/store/auth-store` | `../store/auth-store` |
| `@/components/add-token-dialog` | `./add-token-dialog` |
| `@/components/confirm-dialog` | `./confirm-dialog` |

**sidebar-nav.tsx changes:**
- Replace `import Link from "next/link"` → use plain `<a href="#/dashboard" ...>` elements
- Replace `import { usePathname } from "next/navigation"` → read `window.location.hash`
- Replace `<Link href={...}>` → `<a href={...} onClick={handleNav}>`
- Remove `"use client"`

Rewrite sidebar-nav.tsx nav items:
```typescript
import { cn } from "../lib/utils";
import {
  LayoutDashboard, Key, Settings, ScrollText, Shield, LogOut, X,
} from "lucide-react";
import { useAuthStore } from "../store/auth-store";
import { Button } from "./ui/button";

const navItems = [
  { href: "#/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "#/dashboard/tokens", label: "Tokens", icon: Key },
  { href: "#/dashboard/settings", label: "Settings", icon: Settings },
  { href: "#/dashboard/logs", label: "Logs", icon: ScrollText },
];

interface SidebarNavProps {
  onClose?: () => void;
}

export function SidebarNav({ onClose }: SidebarNavProps) {
  const pathname = window.location.hash || "#/dashboard";
  const logout = useAuthStore((s) => s.logout);

  const handleNav = () => {
    if (onClose) onClose();
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold">OhMyProxy</span>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={handleNav}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-accent-foreground"
          onClick={() => {
            logout();
            window.location.hash = "#/login";
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
```

Other components: replace `@/` imports → relative imports as shown above. Remove `"use client"`.

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/components/
git commit -m "feat(dashboard): add business components with relative imports"
```

---

### Task 11: Create Dashboard Pages

**Files:**
- Create: `src/dashboard/pages/Login.tsx`
- Create: `src/dashboard/pages/Status.tsx`
- Create: `src/dashboard/pages/Tokens.tsx`
- Create: `src/dashboard/pages/Settings.tsx`
- Create: `src/dashboard/pages/Logs.tsx`

- [ ] **Step 1: Create Login.tsx**

Same logic as `dashboard/app/login/page.tsx` but without `proxyUrl`:

```typescript
import React, { useState } from "react";
import { useAuthStore } from "../store/auth-store";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Shield, Key } from "lucide-react";
import { toast } from "sonner";

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const { managementKey, setCredentials, login } = useAuthStore();
  const [key, setKey] = useState(managementKey);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setCredentials(key.trim());
    const success = await login();
    setLoading(false);

    if (success) {
      toast.success("Connected to proxy");
      onLogin();
    } else {
      toast.error("Authentication failed. Check your management key.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">OhMyProxy</CardTitle>
          <CardDescription>Enter your management key to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Management Key
              </Label>
              <Input
                id="key"
                type="password"
                placeholder="Enter your management key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connecting..." : "Connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create Status.tsx**

```typescript
import React from "react";
import { useStatus } from "../hooks/use-status";
import { StatusCard, StatusCardSkeleton } from "../components/status-card";
import { Button } from "../components/ui/button";
import { RefreshCw } from "lucide-react";

export function Status() {
  const { data, loading, error, refetch, autoRefresh, setAutoRefresh } = useStatus();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">Proxy status and metrics</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? "Auto-refresh On" : "Auto-refresh Off"}
          </Button>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <StatusCardSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : data ? (
        <StatusCard data={data} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Create Tokens.tsx** (with "Connect Postman" OAuth button)

```typescript
import React, { useState } from "react";
import { useTokens } from "../hooks/use-tokens";
import { TokenTable } from "../components/token-table";
import { Button } from "../components/ui/button";
import { Plug } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../lib/api-client";

export function Tokens() {
  const { data, loading, error, refetch } = useTokens();
  const [connecting, setConnecting] = useState(false);

  const handleConnectPostman = async () => {
    setConnecting(true);
    try {
      const { url } = await apiClient.getOAuthLoginUrl();
      // Open Postman OAuth in new window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        url,
        "Postman OAuth",
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Poll for popup close, then refresh tokens
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval);
          toast.success("Postman account connected!");
          refetch();
        }
      }, 1000);

      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(interval), 300_000);
    } catch (err: any) {
      toast.error(err.message || "Failed to start OAuth flow");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tokens</h1>
          <p className="text-sm text-muted-foreground">Manage access tokens</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleConnectPostman}
          disabled={connecting}
        >
          <Plug className="mr-2 h-4 w-4" />
          {connecting ? "Connecting..." : "Connect Postman"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <TokenTable tokens={data} loading={loading} onRefresh={refetch} />
    </div>
  );
}
```

- [ ] **Step 4: Create Settings.tsx**

```typescript
import React from "react";
import { useSettings } from "../hooks/use-settings";
import { SettingsForm } from "../components/settings-form";

export function Settings() {
  const { data, loading, error, refetch } = useSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure proxy behavior</p>
      </div>
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      <SettingsForm settings={data} loading={loading} onRefresh={refetch} />
    </div>
  );
}
```

- [ ] **Step 5: Create Logs.tsx**

```typescript
import React from "react";
import { useLogs } from "../hooks/use-logs";
import { LogViewer } from "../components/log-viewer";

export function Logs() {
  const { data, loading, error, refetch } = useLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Logs</h1>
        <p className="text-sm text-muted-foreground">Proxy request logs</p>
      </div>
      <LogViewer data={data} loading={loading} error={error} onRefresh={refetch} />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/pages/
git commit -m "feat(dashboard): add all pages (Login, Status, Tokens, Settings, Logs)"
```

---

### Task 12: Create App Root & Hash Router

**Files:**
- Create: `src/dashboard/app.tsx`

- [ ] **Step 1: Create app.tsx with hash router**

```typescript
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { useAuthStore } from "./store/auth-store";
import { Login } from "./pages/Login";
import { Status } from "./pages/Status";
import { Tokens } from "./pages/Tokens";
import { Settings } from "./pages/Settings";
import { Logs } from "./pages/Logs";
import { SidebarNav } from "./components/sidebar-nav";
import { Button } from "./components/ui/button";
import { Menu } from "lucide-react";

function getPage(hash: string): string {
  if (hash === "#/login") return "login";
  if (hash === "#/dashboard" || hash === "" || hash === "#/") return "dashboard";
  if (hash.startsWith("#/dashboard/tokens")) return "tokens";
  if (hash.startsWith("#/dashboard/settings")) return "settings";
  if (hash.startsWith("#/dashboard/logs")) return "logs";
  return "dashboard";
}

function App() {
  const [page, setPage] = useState(() => getPage(window.location.hash));
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Wait for Zustand persist hydration
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  // Listen for hash changes
  useEffect(() => {
    const onHashChange = () => setPage(getPage(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigateTo = (newPage: string) => {
    let hash = "#/dashboard";
    if (newPage === "login") hash = "#/login";
    else if (newPage === "tokens") hash = "#/dashboard/tokens";
    else if (newPage === "settings") hash = "#/dashboard/settings";
    else if (newPage === "logs") hash = "#/dashboard/logs";
    window.location.hash = hash;
  };

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Login onLogin={() => navigateTo("dashboard")} />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "hsl(var(--card))",
              color: "hsl(var(--card-foreground))",
              border: "1px solid hsl(var(--border))",
            },
          }}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <SidebarNav />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full">
            <SidebarNav onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="flex h-14 items-center gap-3 border-b px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-sm">OhMyProxy</span>
        </div>
        <div className="p-4 md:p-6">
          {page === "dashboard" && <Status />}
          {page === "tokens" && <Tokens />}
          {page === "settings" && <Settings />}
          {page === "logs" && <Logs />}
        </div>
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
            border: "1px solid hsl(var(--border))",
          },
        }}
      />
    </div>
  );
}

// Mount
const rootEl = document.getElementById("root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/app.tsx
git commit -m "feat(dashboard): add app root with hash router"
```

---

### Task 13: Wire Dashboard Serving in ProxyServer

**Files:**
- Modify: `src/ProxyServer.ts`

- [ ] **Step 1: Add static file serving for dashboard**

In `handle()` method, replace the 404 fallback at the end. After the OAuth block, add dashboard static serving:

```typescript
        // Dashboard static files
        if (path === "/" || path === "/dashboard" || path.startsWith("/dashboard/")) {
            return this.serveDashboard();
        }
        if (path.startsWith("/output.css")) {
            return this.serveStatic("src/dashboard/output.css", "text/css");
        }
```

And add the dashboard serving methods to the class:

```typescript
    private serveDashboard(): Response {
        const html = readFileSync(join(import.meta.dir, "..", "src", "dashboard", "index.html"), "utf-8");
        return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    }

    private serveStatic(relPath: string, contentType: string): Response {
        try {
            const file = Bun.file(join(import.meta.dir, "..", relPath));
            return new Response(file, {
                headers: { "Content-Type": contentType },
            });
        } catch {
            return new Response("Not found", { status: 404 });
        }
    }
```

Also add imports at top:
```typescript
import { readFileSync } from "fs";
import { join } from "path";
```

- [ ] **Step 2: Update handle() logic for dashboard routes**

The dashboard SPA should be served for all non-API paths. Modify the 404 handler at the end of `handle()`. The final route check should be:

```typescript
        // Dashboard SPA — serve index.html for all dashboard routes
        const dashboardPaths = ["/", "/login", "/dashboard"];
        if (path === "/" || !path.startsWith("/v1/") && !path.startsWith("/tokens") && !path.startsWith("/management") && !path.startsWith("/oauth/") && !path.startsWith("/health")) {
            return this.serveDashboard();
        }

        if (path !== "/v1/messages" || method !== "POST") {
            return this.json({ error: `Route tidak ditemukan: ${method} ${path}` }, 404);
        }
```

But this is too broad — it catches CSS/JS requests too. Let's be more precise. Only serve dashboard HTML for paths that look like page routes:

```typescript
        // Dashboard SPA fallback (non-API GET requests → index.html)
        if (method === "GET" && !path.startsWith("/v1/") && !path.startsWith("/tokens") && !path.startsWith("/management") && !path.startsWith("/oauth/") && !path.startsWith("/health") && !path.includes(".")) {
            return this.serveDashboard();
        }
```

- [ ] **Step 3: Commit**

```bash
git add src/ProxyServer.ts
git commit -m "feat(proxy): serve dashboard SPA from port 8020"
```

---

### Task 14: Build, Test & Cleanup

**Files:**
- Modify: `package.json` (verify scripts)
- Modify: `src/dashboard/index.css` (any fixes)

- [ ] **Step 1: Build CSS and verify server starts**

```bash
bun run build:css
bun run index.ts
```

Expected: Server starts on port 8020. Visit `http://127.0.0.1:8020/` shows dashboard.

- [ ] **Step 2: Test API endpoints still work**

```bash
curl http://127.0.0.1:8020/health
curl http://127.0.0.1:8020/v1/models
curl -X POST http://127.0.0.1:8020/management/status -H "X-Management-Key: <key>"
```

Expected: All return valid JSON responses.

- [ ] **Step 3: Test dashboard login**

Visit `http://127.0.0.1:8020/` → shows login page. Enter management key → redirects to dashboard.

- [ ] **Step 4: Test OAuth (if credentials configured)**

```bash
curl -X POST http://127.0.0.1:8020/oauth/postman/login \
  -H "X-Management-Key: <key>" \
  -H "Content-Type: application/json"
```

Expected: Returns `{ url: "https://api.getpostman.com/oauth2/authorize?...", state: "..." }` or error if OAuth not configured.

- [ ] **Step 5: Clean up old dashboard**

Once everything works, remove old dashboard directory:

```bash
rm -rf dashboard/
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete single-port migration, remove old Next.js dashboard"
```

---

## Self-Review

### 1. Spec Coverage
- Single port 8020 → Task 13 wires dashboard + existing proxy on same port ✓
- Dashboard rewrite Bun native → Tasks 5-12 create all files ✓
- OAuth login to Postman → Tasks 2-4 implement OAuth flow ✓
- Management key auth preserved → Task 7, no change to ManagementHandler ✓
- Round-robin tokens → No TokenManager changes needed (existing rotate()) ✓

### 2. Placeholder Scan
- No TBDs, no TODOs
- All code steps include complete implementation
- All paths are exact

### 3. Type Consistency
- `OAuthConfig` defined in Task 2, used in Task 3
- `api-client.ts` uses types from `./types.ts`
- Auth store interface consistent with Login page
- Page names match between router and components
