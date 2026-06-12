/**
 * restart.ts — Kill old proxy on port 8020 and start fresh
 * Usage: bun run restart.ts
 */
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir;
const PORT = 8020;

// Step 1: Kill existing process on port 8020
console.log("[restart] Stopping old proxy...");
const killed = spawnSync("sh", ["-c", `kill $(lsof -t -i:${PORT}) 2>/dev/null && echo "killed" || echo "no process found"`]);
console.log(`[restart] ${killed.stdout.toString().trim()}`);

// Step 2: Wait for port to release
await new Promise((r) => setTimeout(r, 1500));

// Step 3: Rebuild dashboard and CSS
console.log("[restart] Building dashboard...");
spawnSync("bun", ["run", "build:dashboard"], { cwd: ROOT, stdio: "inherit" });
spawnSync("bun", ["run", "build:css"], { cwd: ROOT, stdio: "inherit" });

// Step 4: Start proxy (this is blocking)
console.log(`[restart] Starting proxy on port ${PORT}...`);
console.log(`[restart] Dashboard: http://127.0.0.1:${PORT}/`);
console.log(`[restart] Health:   http://127.0.0.1:${PORT}/health\n`);

// Start in foreground
spawnSync("bun", ["run", "index.ts"], { cwd: ROOT, stdio: "inherit" });
