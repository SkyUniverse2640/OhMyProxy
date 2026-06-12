/**
 * restart.ts — Kill anything on port 8020 and start fresh
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir;
const PORT = 8020;

// Step 1: Find and kill any process on port 8020
console.log("[restart] Finding process on port 8020...");
const findPid = spawnSync("sh", ["-c", `lsof -t -i:${PORT} 2>/dev/null || ss -tlnp 2>/dev/null | grep :${PORT} | grep -oP 'pid=\\K\\d+'`]);
const pids = findPid.stdout.toString().trim().split("\n").filter(Boolean);

if (pids.length > 0) {
  for (const pid of pids) {
    console.log(`[restart] Killing PID ${pid}...`);
    spawnSync("kill", ["-9", pid]);
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log("[restart] Old processes killed");
} else {
  console.log("[restart] No process found on port 8020");
}

// Step 2: Wait for port to release
await new Promise((r) => setTimeout(r, 1500));

// Step 3: Rebuild
console.log("[restart] Building dashboard and CSS...");
spawnSync("bun", ["run", "build:dashboard"], { cwd: ROOT, stdio: "inherit" });
spawnSync("bun", ["run", "build:css"], { cwd: ROOT, stdio: "inherit" });

// Step 4: Start proxy
console.log(`\n[restart] Starting proxy on http://127.0.0.1:${PORT}/\n`);
spawnSync("bun", ["run", "index.ts"], { cwd: ROOT, stdio: "inherit" });
