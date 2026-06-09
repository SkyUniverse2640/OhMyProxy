import type { Settings, LogLevel } from "./types";

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const ICONS: Record<string, string> = { debug: "🔍", info: "ℹ️ ", warn: "⚠️ ", error: "❌" };

export class Logger {
  private readonly enabled: boolean;
  private readonly threshold: number;

  constructor(settings: Settings) {
    this.enabled = settings.logging.enabled;
    this.threshold = LEVELS[settings.logging.level ?? "info"];
  }

  log(level: LogLevel, msg: string): void {
    if (!this.enabled) return;
    if (LEVELS[level] < this.threshold) return;
    console.log(`[${new Date().toISOString()}] ${ICONS[level]} ${msg}`);
  }
}
