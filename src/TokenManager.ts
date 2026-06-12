import type { AccessToken } from "./types";
import type { Config } from "./Config";

export class TokenManager {
  private idx = 0;
  private readonly config: Config;

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
}
