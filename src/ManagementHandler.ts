import { readFileSync, writeFileSync, existsSync, truncateSync } from "fs";
import { join } from "path";
import type { Settings } from "./types";
import type { Config } from "./Config";
import type { TokenManager } from "./TokenManager";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Management-Key",
};

class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private maxRequests: number, private windowMs: number) {}

  check(key: string): boolean {
    const now = Date.now();
    let w = this.windows.get(key);
    if (!w || now >= w.resetAt) {
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w);
    }
    w.count++;
    // Periodic cleanup
    if (this.windows.size > 10_000) {
      for (const [k, v] of this.windows) {
        if (now >= v.resetAt) this.windows.delete(k);
      }
    }
    return w.count <= this.maxRequests;
  }

  getClientIp(req: Request): string {
    return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip")
      ?? "127.0.0.1";
  }
}

export class ManagementHandler {
  private settings: Settings;
  private readonly authLimiter = new RateLimiter(5, 60_000); // 5 auth attempts per minute per IP

  constructor(
    private readonly config: Config,
    private readonly tokens: TokenManager,
  ) {
    this.settings = config.loadSettings();
  }

  // ─── Auth ──────────────────────────────────────────────────────────────

  isAuthorized(req: Request): boolean {
    const key = req.headers.get("x-management-key") ?? "";
    const expected = this.settings.management_key ?? "";
    if (!expected) return false;
    return key === expected;
  }

  unauthorized(): Response {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }

  // ─── Route Dispatcher ──────────────────────────────────────────────────

  async handle(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (!path.startsWith("/management")) return null;
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (!this.isAuthorized(req)) {
      // Rate-limit failed auth to prevent brute-force
      const ip = this.authLimiter.getClientIp(req);
      if (!this.authLimiter.check(ip)) {
        return new Response(
          JSON.stringify({ error: "Too many authentication attempts. Please wait." }),
          { status: 429, headers: { "Content-Type": "application/json", ...CORS, "Retry-After": "60" } },
        );
      }
      return this.unauthorized();
    }

    if (path === "/management/status" && method === "GET") return this.getStatus();
    if (path === "/management/quota" && method === "GET") return this.getQuota();
    if (path === "/management/settings" && method === "GET") return this.getSettings();
    if (path === "/management/settings" && method === "PATCH") return this.patchSettings(req);
    if (path === "/management/tokens" && method === "GET") return this.getTokens();
    if (path === "/management/tokens" && method === "POST") return this.addToken(req);
    if (path === "/management/logs" && method === "GET") return this.getLogs();
    if (path === "/management/logs" && method === "DELETE") return this.deleteLogs();

    const tokenDeleteMatch = path.match(/^\/management\/tokens\/(\d+)$/);
    if (tokenDeleteMatch?.[1] && method === "DELETE") return this.deleteToken(parseInt(tokenDeleteMatch[1]));

    const tokenToggleMatch = path.match(/^\/management\/tokens\/(\d+)\/toggle$/);
    if (tokenToggleMatch?.[1] && method === "PATCH") return this.toggleToken(parseInt(tokenToggleMatch[1]));

    return this.json({ error: `Route not found: ${method} ${path}` }, 404);
  }

  // ─── Handlers ──────────────────────────────────────────────────────────

  private getQuota(): Response {
    return this.json({
      tokens: this.tokens.getQuota(),
      total: {
        requests: this.tokens.getQuota().reduce((s, q) => s + q.requestCount, 0),
        rateLimits: this.tokens.getQuota().reduce((s, q) => s + q.rateLimitCount, 0),
      },
    });
  }

  private getStatus(): Response {
    const active = this.tokens.getActive();
    const all = this.tokens.all();
    return this.json({
      status: "ok",
      proxy: {
        host: this.settings.proxy.host,
        port: this.settings.proxy.port,
      },
      tokens: {
        total: all.length,
        active: active.length,
      },
      model: this.settings.postman.model,
      logging: this.settings.logging,
    });
  }

  private getSettings(): Response {
    const s = { ...this.settings };
    // Redact sensitive fields
    delete (s as any).management_key;
    s.secret_keys = s.secret_keys.map(() => "***");
    return this.json(s);
  }

  private async patchSettings(req: Request): Promise<Response> {
    let body: Record<string, any>;
    try { body = await req.json() as Record<string, any>; }
    catch { return this.json({ error: "Body bukan JSON valid" }, 400); }

    const ALLOWED_FIELDS = ["logging"] as const;
    const ALLOWED_POSTMAN_FIELDS = ["model", "platform", "file_viewer_path", "app_version", "user_id", "team_id", "workspace_id", "workspace_name", "ui_build"] as const;
    const current = this.config.loadSettings();

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        (current as any)[field] = { ...(current as any)[field], ...(body as any)[field] };
      }
    }

    // Whitelist specific postman fields — never allow base_url to change
    if ("postman" in body && typeof body.postman === "object") {
      for (const field of ALLOWED_POSTMAN_FIELDS) {
        if (field in body.postman) {
          (current.postman as any)[field] = body.postman[field];
        }
      }
    }

    // Persist
    const settingsPath = join(this.config.getDir(), "settings.json");
    writeFileSync(settingsPath, JSON.stringify(current, null, 2));
    this.config.invalidateSettings();
    this.settings = current;

    const updatedTop = Object.keys(body).filter(k => ALLOWED_FIELDS.includes(k as any));
    const updatedPostman = (body.postman && typeof body.postman === "object")
      ? Object.keys(body.postman).filter(k => ALLOWED_POSTMAN_FIELDS.includes(k as any)).map(k => `postman.${k}`)
      : [];
    return this.json({ message: "Settings updated", updated: [...updatedTop, ...updatedPostman] });
  }

  private getTokens(): Response {
    return this.json(
      this.tokens.all().map(t => ({
        ...t,
        token: `${t.token.slice(0, 8)}...${t.token.slice(-6)}`,
      }))
    );
  }

  private async addToken(req: Request): Promise<Response> {
    let body: any;
    try { body = await req.json(); }
    catch { return this.json({ error: "Body bukan JSON valid" }, 400); }

    if (!body?.token) return this.json({ error: "Field 'token' is required" }, 400);
    if (typeof body.token !== "string" || body.token.length > 4096) return this.json({ error: "Token must be a string with max 4096 characters" }, 400);
    if (body.label && (typeof body.label !== "string" || body.label.length > 256)) return this.json({ error: "Label must be a string with max 256 characters" }, 400);
    if (body.note && (typeof body.note !== "string" || body.note.length > 1024)) return this.json({ error: "Note must be a string with max 1024 characters" }, 400);

    const t = this.tokens.add({
      label: body.label ?? `Token ${Date.now()}`,
      token: body.token,
      active: body.active ?? true,
      note: body.note ?? "",
    });
    return this.json({ message: "Token ditambahkan", id: t.id }, 201);
  }

  private deleteToken(id: number): Response {
    return this.tokens.remove(id)
      ? this.json({ message: `Token #${id} dihapus` })
      : this.json({ error: "Token tidak ditemukan" }, 404);
  }

  private toggleToken(id: number): Response {
    const t = this.tokens.toggle(id);
    return t
      ? this.json({ message: `Token #${id} ${t.active ? "aktif" : "nonaktif"}`, active: t.active })
      : this.json({ error: "Token tidak ditemukan" }, 404);
  }

  private getLogs(): Response {
    if (!this.settings.logging.enabled) {
      return this.json({ error: "Logging tidak aktif" }, 400);
    }
    const logPath = join(this.config.getDir(), "proxy.log");
    if (!existsSync(logPath)) {
      return this.json({ lines: [], total: 0 });
    }
    const raw = readFileSync(logPath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    return this.json({ lines, total: lines.length });
  }

  private deleteLogs(): Response {
    const logPath = join(this.config.getDir(), "proxy.log");
    if (existsSync(logPath)) truncateSync(logPath, 0);
    return this.json({ message: "Logs cleared" });
  }

  // ─── Helper ────────────────────────────────────────────────────────────

  private json(data: object, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
