/**
 * Postman OAuth Flow - Node.js Implementation
 * Mereplikasi alur autentikasi dari Postman Desktop App
 *
 * Cara pakai:
 *   node postman-oauth.js
 *
 * Dependencies:
 *   npm install express open
 */

const http = require("http");
const https = require("https");
const url = require("url");
const crypto = require("crypto");
const { EventEmitter } = require("events");

// ─── Konfigurasi (diambil dari source Postman) ────────────────────────────────

const CONFIG = {
    identityURL: "https://identity.getpostman.com",
    globalIdentityURL: "https://auth.postman.com",
    appId: "erisedstraehruoytubecafruoytonwohsi",

    // Port lokal untuk menangkap callback
    callbackPort: 10506,
    callbackPath: "/auth/callback",

    // Timeout menunggu user login (ms)
    loginTimeout: 5 * 60 * 1000,
};

CONFIG.redirectUrl = `http://127.0.0.1:${CONFIG.callbackPort}${CONFIG.callbackPath}`;

// ─── Event Bus sederhana (menggantikan pm.eventBus) ───────────────────────────

class EventBus extends EventEmitter {
    channel(name) {
        return {
            publish: (event) => this.emit(name, event),
            subscribe: (handler) => {
                this.on(name, handler);
                return () => this.off(name, handler); // unsubscribe function
            },
        };
    }
}

const eventBus = new EventBus();

// ─── Auth Service (menggantikan authService.js) ───────────────────────────────

const authService = {
    getEventChannel() {
        return eventBus.channel("auth-window-events");
    },

    send(data) {
        this.getEventChannel().publish({
            name: "response",
            namespace: "auth-window",
            data,
        });
    },

    onResponse(handler) {
        return this.getEventChannel().subscribe((event) => {
            if (event.name === "response") handler(event.data);
        });
    },
};

// ─── URL Builder (mereplikasi logika di authService init) ─────────────────────

function buildAuthUrl(options = {}) {
    const {
        isSignup = false,
        email = null,
        target = "login", // "login" | "signup" | "google" | "github" | "enterprise-login" | "switch-context"
        userID = null,
        expiredAccessToken = null,
        newAccountRegionPreference = null,
        extraParams = {},
    } = options;

    const params = {
        app_id: CONFIG.appId,
        redirect_uri: CONFIG.redirectUrl,
        ...extraParams,
    };

    let baseUrl;

    if (email && isSignup) {
        // Signup dengan email
        Object.assign(params, {
            email,
            __showRegionChooserIfNoneDetected: 1,
            __region: newAccountRegionPreference,
        });
        baseUrl = `${CONFIG.globalIdentityURL}/__redirect/client/signup`;
    } else if (email && !isSignup) {
        // Re-login (token expired)
        Object.assign(params, {
            email,
            reAuthenticate: "1",
            user_id: userID,
            expiredAccessToken,
        });
        baseUrl = `${CONFIG.identityURL}/client/login`;
    } else if (
        ["switch-context", "google", "enterprise-login", "github"].includes(target)
    ) {
        // OAuth provider eksternal
        params.target = target;
        baseUrl = `${CONFIG.identityURL}/client/browser-auth/init`;
    } else {
        // Login/signup biasa
        Object.assign(params, {
            __showRegionChooserIfNoneDetected: 1,
            __region: newAccountRegionPreference,
        });
        baseUrl = `${CONFIG.globalIdentityURL}/__redirect${
            isSignup ? "/client/signup" : "/client/login"
        }`;
    }

    const query = new URLSearchParams(
        Object.fromEntries(
            Object.entries(params).filter(([, v]) => v != null && v !== "")
        )
    ).toString();

    return `${baseUrl}?${query}`;
}

// ─── Callback Handler (menggantikan fungsi m() di source asli) ─────────────────

function parseCallbackUrl(callbackUrl) {
    const parsed = new URL(callbackUrl);
    const n = Object.fromEntries(parsed.searchParams.entries());

    // Sama persis dengan struktur di source Postman
    const userData = {
        id: n.user_id,
        teamId: n.team_id,
        name: n.name,
        email: n.email,
        username: n.username,
        locale: n.locale,
        auth: {
            access_token: n.access_token,
            multi_login_token: n.multi_login_token,
        },
        region: n.region,
    };

    let config = {};
    if (n.config) {
        try {
            config = JSON.parse(n.config);
        } catch (_) {}
    }

    return {
        success: true,
        cancel: false,
        error: null,
        authData: {
            userData,
            config,
            additionalData: { action: n.action },
            continueUrl: n.continueUrl,
        },
    };
}

// ─── Local HTTP Server (menggantikan webview + chromiumapp.org) ───────────────

function startCallbackServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const reqUrl = new URL(req.url, `http://127.0.0.1:${CONFIG.callbackPort}`);

            if (reqUrl.pathname !== CONFIG.callbackPath) {
                res.writeHead(404);
                res.end("Not found");
                return;
            }

            // Halaman HTML sukses (ditampilkan di browser user)
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`
            <!DOCTYPE html>
            <html>
            <head>
            <title>Postman - Login Berhasil</title>
            <style>
            body { font-family: system-ui; display: flex; align-items: center;
                justify-content: center; height: 100vh; margin: 0;
                background: #f0f2f5; }
                .card { background: white; padding: 2rem 3rem; border-radius: 12px;
                    text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
                    h2 { color: #ff6c37; }
                    p { color: #555; }
                    </style>
                    </head>
                    <body>
                    <div class="card">
                    <h2>✓ Login Berhasil</h2>
                    <p>Kamu sudah berhasil masuk. Halaman ini bisa ditutup.</p>
                    </div>
                    </body>
                    </html>
                    `);

            // Kirim hasil ke aplikasi via event bus
            const result = parseCallbackUrl(reqUrl.toString());
            authService.send(result);

            // Tutup server setelah menerima callback
            server.close();
            resolve(result);
        });

        server.on("error", reject);
        server.listen(CONFIG.callbackPort, "127.0.0.1", () => {
            console.log(
                `[OAuth] Callback server aktif di http://127.0.0.1:${CONFIG.callbackPort}`
            );
        });

        // Timeout otomatis
        const timer = setTimeout(() => {
            server.close();
            reject(new Error("Login timeout: user tidak menyelesaikan login dalam 5 menit"));
        }, CONFIG.loginTimeout);

        server.on("close", () => clearTimeout(timer));
    });
}

// ─── Buka Browser (menggantikan webview Electron) ─────────────────────────────

async function openBrowser(targetUrl) {
    // Coba gunakan 'open' package, fallback ke perintah OS
    try {
        const open = require("open");
        await open(targetUrl);
        return;
    } catch (_) {}

    // Fallback manual
    const { exec } = require("child_process");
    const platform = process.platform;
    const cmd =
    platform === "win32"
    ? `start "" "${targetUrl}"`
    : platform === "darwin"
    ? `open "${targetUrl}"`
    : `xdg-open "${targetUrl}"`;

    exec(cmd, (err) => {
        if (err) console.error("[OAuth] Gagal membuka browser:", err.message);
    });
}

// ─── Fungsi Utama: login() ────────────────────────────────────────────────────

async function login(options = {}) {
    console.log("[OAuth] Memulai alur autentikasi Postman...");

    // 1. Bangun URL autentikasi
    const authUrl = buildAuthUrl(options);
    console.log("[OAuth] URL autentikasi:", authUrl);

    // 2. Mulai server callback di background
    const callbackPromise = startCallbackServer();

    // 3. Buka browser agar user login
    await openBrowser(authUrl);
    console.log("[OAuth] Browser dibuka. Menunggu user login...");

    // 4. Tunggu callback
    const result = await callbackPromise;

    console.log("[OAuth] Login berhasil!");
    console.log("[OAuth] User:", result.authData.userData.email);

    return result;
}

// ─── Contoh penggunaan via Event Bus (seperti di source asli) ─────────────────

function listenForAuthResult() {
    const unsubscribe = authService.onResponse((data) => {
        if (data.success && !data.cancel) {
            console.log("\n[EventBus] Token diterima:");
            console.log("  access_token :", data.authData.userData.auth.access_token);
            console.log("  user_id      :", data.authData.userData.id);
            console.log("  email        :", data.authData.userData.email);
        } else if (data.cancel) {
            console.log("[EventBus] User membatalkan login.");
        } else {
            console.log("[EventBus] Login gagal:", data.error);
        }
        unsubscribe();
    });
}

// ─── Cancel / Skip (tombol "Skip" di UI Postman) ──────────────────────────────

function cancelLogin() {
    authService.send({
        success: true,
        error: null,
        cancel: true,
        authData: { userData: { id: 0 } },
    });
    console.log("[OAuth] Login dibatalkan.");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
    // Daftarkan listener event bus (opsional, untuk demo)
    listenForAuthResult();

    try {
        // Login biasa
        const result = await login({ target: "login" });

        // Atau login dengan Google:
        // const result = await login({ target: "google" });

        // Atau login dengan GitHub:
        // const result = await login({ target: "github" });

        // Atau signup dengan email:
        // const result = await login({ isSignup: true, email: "user@example.com" });

        return result;
    } catch (err) {
        console.error("[OAuth] Error:", err.message);
        process.exit(1);
    }
}

// Jalankan jika dipanggil langsung
if (require.main === module) {
    main().then(() => process.exit(0));
}

// Export untuk dipakai sebagai modul
module.exports = {
    login,
    cancelLogin,
    buildAuthUrl,
    parseCallbackUrl,
    authService,
    eventBus,
    CONFIG,
};
