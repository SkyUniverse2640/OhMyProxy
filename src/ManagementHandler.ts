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

export class ManagementHandler {
  private readonly settings: Settings;

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
      JSON.stringify({ error: "Invalid or missing X-Management-Key" }),
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

    if (!this.isAuthorized(req)) return this.unauthorized();

    if (path === "/management/status" && method === "GET") return this.getStatus();
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

    const ALLOWED_FIELDS = ["logging", "postman"] as const;
    const current = this.config.loadSettings();

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        (current as any)[field] = { ...(current as any)[field], ...(body as any)[field] };
      }
    }

    // Persist
    const settingsPath = join(this.config.getDir(), "settings.json");
    writeFileSync(settingsPath, JSON.stringify(current, null, 2));

    return this.json({ message: "Settings updated", updated: Object.keys(body).filter(k => ALLOWED_FIELDS.includes(k as any)) });
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

    if (!body?.token) return this.json({ error: "Field 'token' wajib" }, 400);

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
