// OhMyProxy Setup Wizard
// Run: bun run setup
//
// Interactive first-time configuration for the proxy.

import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";

const DIR = import.meta.dir;
const SETTINGS_PATH = join(DIR, "settings.json");
const TOKENS_PATH = join(DIR, "list_access_token.json");

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      resolve(answer);
    });
  });
}

function banner(): void {
  console.log(`
  ╔══════════════════════════════════════╗
  ║       OhMyProxy Setup Wizard         ║
  ║  Postman Claude Proxy Configuration  ║
  ╚══════════════════════════════════════╝
  `);
}

async function main(): Promise<void> {
  banner();

  // Check if already configured
  if (existsSync(SETTINGS_PATH)) {
    const overwrite = await ask(
      "settings.json already exists. Overwrite? [y/N] "
    );
    if (overwrite.toLowerCase() !== "y") {
      console.log("\nSetup cancelled. Existing configuration preserved.");
      rl.close();
      return;
    }
  }

  console.log("\n── Proxy Configuration ──\n");

  const port = await ask("Port [8020]: ");
  const host = await ask("Host [127.0.0.1]: ");

  console.log("\n── Authentication ──\n");

  const managementKey = await ask("Dashboard management key (for web UI): ");
  const secretKey = await ask("API secret key (for Claude Code): ");

  console.log("\n── Postman Gateway ──\n");

  const userId = await ask("Postman User ID: ");
  const teamId = await ask("Postman Team ID: ");
  const workspaceId = await ask("Postman Workspace ID: ");
  const workspaceName = await ask("Postman Workspace Name: ");
  const model = await ask("Model [CLAUDE_OPUS_48_BEDROCK]: ");

  console.log("\n── OAuth (Optional) ──\n");

  const enableOAuth = await ask("Configure OAuth for Postman login? [y/N]: ");
  let oauthConfig: any = undefined;

  if (enableOAuth.toLowerCase() === "y") {
    const clientId = await ask("OAuth Client ID: ");
    const clientSecret = await ask("OAuth Client Secret: ");
    const redirectUri = await ask(
      "OAuth Redirect URI [http://127.0.0.1:8020/oauth/postman/callback]: "
    );
    oauthConfig = {
      postman: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri || "http://127.0.0.1:8020/oauth/postman/callback",
      },
    };
  }

  const settings: any = {
    proxy: {
      port: parseInt(port || "8020"),
      host: host || "127.0.0.1",
    },
    management_key: managementKey || "change-me",
    secret_keys: [secretKey || "change-me"],
    postman: {
      base_url: "https://gateway.postman.com",
      app_version: "12.14.0",
      platform: "DESKTOP_WINDOWS",
      model: model || "CLAUDE_OPUS_48_BEDROCK",
      user_id: userId,
      team_id: teamId,
      workspace_id: workspaceId,
      workspace_name: workspaceName,
      file_viewer_path: "",
      ui_build: {
        date: "260608",
        time: "0232",
        tools_hash: "8ee55e448f00",
        kb_hash: "60bea1c5eac3",
      },
    },
    logging: {
      enabled: true,
      level: "info",
    },
  };

  if (oauthConfig) {
    settings.oauth = oauthConfig;
  }

  // Write settings
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log(`\n  [OK] settings.json created`);

  // Create empty token file if needed
  if (!existsSync(TOKENS_PATH)) {
    writeFileSync(TOKENS_PATH, "[]\n");
    console.log("  [OK] list_access_token.json created");
  }

  console.log(`\n── Setup Complete ──\n`);
  console.log(`  Start the proxy:  bun run start`);
  console.log(`  Dashboard:        http://${host || "127.0.0.1"}:${port || "8020"}/`);
  console.log(`  Management key:   ${managementKey || "(not set)"}`);
  console.log();

  rl.close();
}

main().catch((e) => {
  console.error("Setup error:", e.message);
  rl.close();
  process.exit(1);
});
