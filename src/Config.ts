import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import type { Settings, AccessToken } from "./types";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const KEY_HASH = "sha256";

export class Config {
  private readonly dir: string;
  private _settingsCache: Settings | null = null;

  constructor(dir: string) {
    this.dir = dir;
  }

  getDir(): string {
    return this.dir;
  }

  loadSettings(): Settings {
    if (this._settingsCache) return this._settingsCache;
    const path = join(this.dir, "settings.json");
    if (!existsSync(path)) {
      this.createDefaultSettings(path);
    }
    this._settingsCache = JSON.parse(readFileSync(path, "utf-8")) as Settings;
    return this._settingsCache;
  }

  invalidateSettings(): void {
    this._settingsCache = null;
  }

  loadTokens(): AccessToken[] {
    const path = join(this.dir, "list_access_token.json");
    if (!existsSync(path)) {
      writeFileSync(path, "[]", "utf-8");
      return [];
    }

    const raw = readFileSync(path, "utf-8").trim();

    // Try encrypted format first
    if (raw.startsWith("enc:")) {
      return this.decryptTokens(raw.slice(4));
    }

    // Fallback: plaintext JSON (legacy tokens)
    try {
      const tokens = JSON.parse(raw) as AccessToken[];
      // Migrate to encrypted format on next save
      return tokens;
    } catch {
      return [];
    }
  }

  saveTokens(tokens: AccessToken[]): void {
    const encrypted = this.encryptTokens(tokens);
    writeFileSync(join(this.dir, "list_access_token.json"), `enc:${encrypted}`);
  }

  // ─── Encryption ──────────────────────────────────────────────────────────

  private getEncryptionKey(): Buffer {
    const settings = this.loadSettings();
    const key = (settings.management_key ?? "change-me").slice(0, 128);
    return createHash(KEY_HASH).update(key).digest(); // 32 bytes
  }

  private encryptTokens(tokens: AccessToken[]): string {
    try {
      const key = this.getEncryptionKey();
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const plaintext = JSON.stringify(tokens);

      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf-8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      // Format: base64(iv):base64(authTag):base64(ciphertext)
      return [
        iv.toString("base64"),
        authTag.toString("base64"),
        encrypted.toString("base64"),
      ].join(":");
    } catch (e: any) {
      console.error(`[config] Encryption failed: ${e.message}. Saving as plaintext.`);
      // Fallback: save as plaintext inside the new format
      return `PLAINTEXT:${Buffer.from(JSON.stringify(tokens)).toString("base64")}`;
    }
  }

  private decryptTokens(payload: string): AccessToken[] {
    // Plaintext fallback within encrypted format
    if (payload.startsWith("PLAINTEXT:")) {
      try {
        return JSON.parse(Buffer.from(payload.slice(11), "base64").toString("utf-8"));
      } catch {
        return [];
      }
    }

    try {
      const key = this.getEncryptionKey();
      const parts = payload.split(":");
      if (parts.length !== 3) {
        throw new Error("Invalid encrypted payload format");
      }

      const iv = Buffer.from(parts[0]!, "base64");
      const authTag = Buffer.from(parts[1]!, "base64");
      const ciphertext = Buffer.from(parts[2]!, "base64");

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return JSON.parse(decrypted.toString("utf-8")) as AccessToken[];
    } catch (e: any) {
      console.error(`[config] Decryption failed: ${e.message}. Returning empty token list.`);
      return [];
    }
  }

  private createDefaultSettings(path: string): void {
    const defaults: Settings = {
      proxy: { port: 8020, host: "127.0.0.1" },
      secret_keys: ["change-me"],
      management_key: "change-me",
      postman: {
        base_url: "https://gateway.postman.com",
        app_version: "12.14.0",
        platform: "DESKTOP_WINDOWS",
        model: "CLAUDE_OPUS_48_BEDROCK",
        user_id: "",
        team_id: "",
        workspace_id: "",
        workspace_name: "",
        file_viewer_path: "",
        ui_build: { date: "", time: "", tools_hash: "", kb_hash: "" },
      },
      logging: { enabled: true, level: "info" },
    };
    writeFileSync(path, JSON.stringify(defaults, null, 2));
    console.log(`[config] Created default settings.json — edit this file to configure the proxy`);
  }
}
