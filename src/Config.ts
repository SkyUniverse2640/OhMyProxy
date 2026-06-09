import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Settings, AccessToken } from "./types";

export class Config {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  loadSettings(): Settings {
    return JSON.parse(readFileSync(join(this.dir, "settings.json"), "utf-8"));
  }

  loadTokens(): AccessToken[] {
    return JSON.parse(readFileSync(join(this.dir, "list_access_token.json"), "utf-8"));
  }

  saveTokens(tokens: AccessToken[]): void {
    writeFileSync(join(this.dir, "list_access_token.json"), JSON.stringify(tokens, null, 2));
  }
}
