import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from "node:crypto";
import type { Settings, AccessToken } from "./types";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEYLEN = 32; // 256 bits
const SALT_LENGTH = 16; // 128-bit salt

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

    // Warn about default credentials on every load
    const s = this._settingsCache;
    const hasDefaultSecret = s.secret_keys.some(k => k === "change-me");
    const hasDefaultMgmt = s.management_key === "change-me";
    if (hasDefaultSecret || hasDefaultMgmt) {
      console.error(
        "\n" +
        "  ╔══════════════════════════════════════════════════════════════╗\n" +
        "  ║  SECURITY WARNING: Default credentials detected!            ║\n" +
        "  ║  Edit settings.json and change:                             ║\n" +
        (hasDefaultSecret ? "  ║  - secret_keys: \"change-me\" → set a strong random value      ║\n" : "") +
        (hasDefaultMgmt ? "  ║  - management_key: \"change-me\" → set a strong random value   ║\n" : "") +
        "  ╚══════════════════════════════════════════════════════════════╝\n"
      );
    }

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

  private getEncryptionKey(salt?: Buffer): { key: Buffer; salt: Buffer } {
    const settings = this.loadSettings();
    const passphrase = (settings.management_key ?? "change-me").slice(0, 128);
    const actualSalt = salt ?? randomBytes(SALT_LENGTH);
    const key = pbkdf2Sync(passphrase, actualSalt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, "sha512");
    return { key, salt: actualSalt };
  }

  // Legacy key derivation (SHA256) for backward-compatible decryption
  private getLegacyEncryptionKey(): Buffer {
    const settings = this.loadSettings();
    const passphrase = (settings.management_key ?? "change-me").slice(0, 128);
    return createHash("sha256").update(passphrase).digest();
  }

  private encryptTokens(tokens: AccessToken[]): string {
    try {
      const { key, salt } = this.getEncryptionKey();
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const plaintext = JSON.stringify(tokens);

      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf-8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      // Format: base64(salt):base64(iv):base64(authTag):base64(ciphertext)
      return [
        salt.toString("base64"),
        iv.toString("base64"),
        authTag.toString("base64"),
        encrypted.toString("base64"),
      ].join(":");
    } catch (e: any) {
      console.error("[config] Token encryption failed — tokens not saved.");
      throw new Error("Failed to encrypt tokens");
    }
  }

  private decryptTokens(payload: string): AccessToken[] {
    try {
      const parts = payload.split(":");
      // Support both legacy 3-part and new 4-part format
      let key: Buffer;
      let iv: Buffer;
      let authTag: Buffer;
      let ciphertext: Buffer;

      if (parts.length === 4) {
        // New format: salt:iv:authTag:ciphertext
        const salt = Buffer.from(parts[0]!, "base64");
        iv = Buffer.from(parts[1]!, "base64");
        authTag = Buffer.from(parts[2]!, "base64");
        ciphertext = Buffer.from(parts[3]!, "base64");
        key = this.getEncryptionKey(salt).key;
      } else if (parts.length === 3) {
        // Legacy format: iv:authTag:ciphertext (no salt, SHA256 key derivation)
        iv = Buffer.from(parts[0]!, "base64");
        authTag = Buffer.from(parts[1]!, "base64");
        ciphertext = Buffer.from(parts[2]!, "base64");
        key = this.getLegacyEncryptionKey();
      } else {
        throw new Error("Invalid encrypted payload format");
      }

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return JSON.parse(decrypted.toString("utf-8")) as AccessToken[];
    } catch {
      console.error("[config] Token decryption failed — returning empty token list.");
      return [];
    }
  }

  private createDefaultSettings(path: string): void {
    const mgmtKey = randomBytes(32).toString("hex");
    const defaults: Settings = {
      proxy: { port: 8020, host: "127.0.0.1" },
      secret_keys: ["change-me"],
      management_key: mgmtKey,
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
    console.log(`[config] Created default settings.json`);
    console.log(`[config] Management key: ${mgmtKey}`);
    console.log(`[config] Edit settings.json to configure secret_keys and other options`);
  }
}
