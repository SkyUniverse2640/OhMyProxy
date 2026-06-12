import { appendFileSync } from "fs";
import { join } from "path";
import type { Settings, LogLevel } from "./types";

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const ICONS: Record<string, string> = { debug: "🔍", info: "ℹ️ ", warn: "⚠️ ", error: "❌" };

export class Logger {
  private readonly enabled: boolean;
  private readonly threshold: number;
  private readonly logPath: string;

  constructor(settings: Settings, configDir: string) {
    this.enabled = settings.logging.enabled;
    this.threshold = LEVELS[settings.logging.level] ?? 1;
    this.logPath = join(configDir, "proxy.log");
  }

  log(level: LogLevel, msg: string): void {
    if (!this.enabled) return;
    if ((LEVELS[level] ?? 0) < this.threshold) return;
    const line = `[${new Date().toISOString()}] ${ICONS[level]} ${msg}`;
    console.log(line);
    try { appendFileSync(this.logPath, line + "\n"); } catch {}
  }
}
