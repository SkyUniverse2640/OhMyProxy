import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { Settings, AccessToken } from "./types";

export class Config {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  getDir(): string {
    return this.dir;
  }

  loadSettings(): Settings {
    const path = join(this.dir, "settings.json");
    if (!existsSync(path)) {
      this.createDefaultSettings(path);
    }
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  loadTokens(): AccessToken[] {
    const path = join(this.dir, "list_access_token.json");
    if (!existsSync(path)) {
      writeFileSync(path, "[]", "utf-8");
      return [];
    }
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  saveTokens(tokens: AccessToken[]): void {
    writeFileSync(join(this.dir, "list_access_token.json"), JSON.stringify(tokens, null, 2));
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
