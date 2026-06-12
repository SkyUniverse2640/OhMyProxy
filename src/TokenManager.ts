import type { AccessToken } from "./types";
import type { Config } from "./Config";

export interface QuotaStats {
  id: number;
  label: string;
  requestCount: number;
  rateLimitCount: number;
  lastUsed: number | null;
  active: boolean;
  limit: number;
  usage: number;
  cycleStart: string;
  cycleEnd: string;
  usageState: string;
}

export class TokenManager {
  private idx = 0;
  private readonly config: Config;
  private readonly stats: Map<number, {
    requestCount: number;
    rateLimitCount: number;
    lastUsed: number | null;
    limit: number;
    usage: number;
    cycleStart: string;
    cycleEnd: string;
    usageState: string;
  }> = new Map();

  constructor(config: Config) {
    this.config = config;
  }

  getActive(): AccessToken[] {
    return this.config.loadTokens().filter(t => t.active);
  }

  current(): AccessToken | null {
    const active = this.getActive();
    return active.length ? (active[this.idx % active.length] ?? null) : null;
  }

  rotate(): AccessToken | null {
    const active = this.getActive();
    if (!active.length) return null;
    this.idx = (this.idx + 1) % active.length;
    return this.current();
  }

  all(): AccessToken[] {
    return this.config.loadTokens();
  }

  add(data: Omit<AccessToken, "id">): AccessToken {
    const tokens = this.config.loadTokens();
    const entry: AccessToken = { id: Math.max(0, ...tokens.map(t => t.id)) + 1, ...data };
    tokens.push(entry);
    this.config.saveTokens(tokens);
    return entry;
  }

  remove(id: number): boolean {
    const tokens = this.config.loadTokens();
    const filtered = tokens.filter(t => t.id !== id);
    if (filtered.length === tokens.length) return false;
    this.config.saveTokens(filtered);
    this.stats.delete(id);
    return true;
  }

  toggle(id: number): AccessToken | null {
    const tokens = this.config.loadTokens();
    const token = tokens.find(t => t.id === id);
    if (!token) return null;
    token.active = !token.active;
    this.config.saveTokens(tokens);
    return token;
  }

  // ─── Quota Tracking ─────────────────────────────────────────────────

  recordRequest(tokenId: number): void {
    let s = this.stats.get(tokenId);
    if (!s) {
      s = { requestCount: 0, rateLimitCount: 0, lastUsed: null, limit: 0, usage: 0, cycleStart: "", cycleEnd: "", usageState: "AVAILABLE" };
      this.stats.set(tokenId, s);
    }
    s.requestCount++;
    s.lastUsed = Date.now();
  }

  recordRateLimit(tokenId: number): void {
    let s = this.stats.get(tokenId);
    if (!s) {
      s = { requestCount: 0, rateLimitCount: 0, lastUsed: null, limit: 0, usage: 0, cycleStart: "", cycleEnd: "", usageState: "AVAILABLE" };
      this.stats.set(tokenId, s);
    }
    s.rateLimitCount++;
    s.lastUsed = Date.now();
  }

  recordQuota(tokenId: number, limit: number, usage: number, cycleStart: string, cycleEnd: string, usageState: string): void {
    let s = this.stats.get(tokenId);
    if (!s) {
      s = { requestCount: 0, rateLimitCount: 0, lastUsed: null, limit: 0, usage: 0, cycleStart: "", cycleEnd: "", usageState: "AVAILABLE" };
      this.stats.set(tokenId, s);
    }
    s.limit = limit;
    s.usage = usage;
    s.cycleStart = cycleStart;
    s.cycleEnd = cycleEnd;
    s.usageState = usageState;
  }

  getQuota(): QuotaStats[] {
    const tokens = this.all();
    return tokens.map(t => {
      const s = this.stats.get(t.id);
      return {
        id: t.id,
        label: t.label,
        requestCount: s?.requestCount ?? 0,
        rateLimitCount: s?.rateLimitCount ?? 0,
        lastUsed: s?.lastUsed ?? null,
        active: t.active,
        limit: s?.limit ?? 0,
        usage: s?.usage ?? 0,
        cycleStart: s?.cycleStart ?? "",
        cycleEnd: s?.cycleEnd ?? "",
        usageState: s?.usageState ?? "AVAILABLE",
      };
    });
  }
}
