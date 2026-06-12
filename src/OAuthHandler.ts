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
