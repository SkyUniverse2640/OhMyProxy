/**
 * Postman OAuth v3 - Menggunakan chromiumapp.org sebagai redirect
 *
 * Cara kerja:
 * 1. Pakai redirect_uri = https://erisedstraehruoytubecafruoytonwohsi.chromiumapp.org
 * 2. Intercept DNS: arahkan chromiumapp.org ke 127.0.0.1
 * 3. Jalankan HTTPS server lokal yang menangkap callback
 *
 * Cara pakai:
 *   sudo node postman-oauth-v3.js
 *   (perlu sudo untuk edit /etc/hosts dan bind port 443)
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { exec, execSync } = require('child_process');

const APP_ID = 'erisedstraehruoytubecafruoytonwohsi';
const REDIRECT_HOST = `${APP_ID}.chromiumapp.org`;
const REDIRECT_URI = `https://${REDIRECT_HOST}`;

// ─── Self-signed cert untuk HTTPS lokal ──────────────────────────────────────

function generateSelfSignedCert() {
    try {
        execSync(`openssl req -x509 -newkey rsa:2048 -keyout /tmp/pm-key.pem \
        -out /tmp/pm-cert.pem -days 1 -nodes \
        -subj "/CN=${REDIRECT_HOST}" \
        -addext "subjectAltName=DNS:${REDIRECT_HOST}" 2>/dev/null`);
        return {
            key: fs.readFileSync('/tmp/pm-key.pem'),
            cert: fs.readFileSync('/tmp/pm-cert.pem'),
        };
    } catch(e) {
        throw new Error('openssl tidak tersedia: ' + e.message);
    }
}

// ─── /etc/hosts manipulation ──────────────────────────────────────────────────

const HOSTS_ENTRY = `127.0.0.1 ${REDIRECT_HOST}`;
const HOSTS_FILE = '/etc/hosts';

function addHostsEntry() {
    const current = fs.readFileSync(HOSTS_FILE, 'utf8');
    if (current.includes(REDIRECT_HOST)) {
        console.log('[HOSTS] Entry sudah ada');
        return false;
    }
    fs.appendFileSync(HOSTS_FILE, `\n${HOSTS_ENTRY}\n`);
    console.log('[HOSTS] Entry ditambahkan:', HOSTS_ENTRY);
    return true;
}

function removeHostsEntry() {
    const current = fs.readFileSync(HOSTS_FILE, 'utf8');
    const updated = current.split('\n')
    .filter(line => !line.includes(REDIRECT_HOST))
    .join('\n');
    fs.writeFileSync(HOSTS_FILE, updated);
    console.log('[HOSTS] Entry dihapus');
}

// ─── HTTPS Server lokal ───────────────────────────────────────────────────────

function startHttpsServer(creds) {
    return new Promise((resolve, reject) => {
        const server = https.createServer(creds, (req, res) => {
            const fullUrl = new URL(req.url, `https://${REDIRECT_HOST}`);
            const params = Object.fromEntries(fullUrl.searchParams.entries());

            console.log('\n[SERVER] Callback diterima!');
            console.log('  Path  :', fullUrl.pathname);
            console.log('  Params:', JSON.stringify(params, null, 4));

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
            <html><body style="font-family:system-ui;padding:2rem;text-align:center;background:#f0f2f5">
            <div style="background:white;max-width:400px;margin:auto;padding:2rem;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1)">
            <h2 style="color:#ff6c37">✓ Login Berhasil</h2>
            <p style="color:#555">Token berhasil ditangkap. Silakan tutup tab ini.</p>
            </div>
            </body></html>
            `);

            if (params.access_token || params.user_id) {
                server.close();
                resolve(params);
            }
        });

        server.on('error', (e) => {
            if (e.code === 'EACCES') {
                reject(new Error('Port 443 butuh sudo. Jalankan: sudo node postman-oauth-v3.js'));
            } else {
                reject(e);
            }
        });

        server.listen(443, '127.0.0.1', () => {
            console.log('[SERVER] HTTPS server aktif di https://127.0.0.1:443');
        });

        setTimeout(() => { server.close(); reject(new Error('Timeout 5 menit')); }, 5 * 60 * 1000);
    });
}

// ─── Parse token dari callback ────────────────────────────────────────────────

function parseToken(params) {
    return {
        success: true,
        cancel: false,
        error: null,
        authData: {
            userData: {
                id:       params.user_id,
                teamId:   params.team_id,
                name:     params.name,
                email:    params.email,
                username: params.username,
                locale:   params.locale,
                region:   params.region,
                auth: {
                    access_token:      params.access_token,
                    multi_login_token: params.multi_login_token,
                },
            },
            config:         params.config ? JSON.parse(params.config) : {},
            additionalData: { action: params.action },
            continueUrl:    params.continueUrl,
        },
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function login(options = {}) {
    const {
        target = 'login',   // 'login' | 'google' | 'github' | 'enterprise-login'
        isSignup = false,
        email = null,
    } = options;

    const authFlowId = crypto.randomUUID();

    // Build URL (sama seperti source Postman)
    const params = new URLSearchParams({
        app_id: APP_ID,
        redirect_uri: REDIRECT_URI,
        authFlowId,
    });

    let baseUrl;
    if (['google', 'github', 'enterprise-login', 'switch-context'].includes(target)) {
        params.set('target', target);
        baseUrl = 'https://identity.getpostman.com/client/browser-auth/init';
    } else {
        baseUrl = `https://auth.postman.com/__redirect/client/${isSignup ? 'signup' : 'login'}`;
        if (email) params.set('email', email);
    }

    const loginUrl = `${baseUrl}?${params.toString()}`;

    console.log('='.repeat(60));
    console.log('Postman OAuth v3');
    console.log('='.repeat(60));
    console.log('Target     :', target);
    console.log('authFlowId :', authFlowId);
    console.log('redirectUri:', REDIRECT_URI);
    console.log('');

    // Setup
    let hostsAdded = false;
    try {
        console.log('[SETUP] Membuat self-signed certificate...');
        const creds = generateSelfSignedCert();

        console.log('[SETUP] Menambahkan hosts entry...');
        hostsAdded = addHostsEntry();

        // Start server
        const serverPromise = startHttpsServer(creds);

        // Buka browser
        console.log('\n[AUTH] Membuka browser...');
        console.log('URL:', loginUrl);
        const openCmd = process.platform === 'darwin' ? `open "${loginUrl}"`
        : process.platform === 'win32'   ? `start "" "${loginUrl}"`
        : `xdg-open "${loginUrl}"`;
        exec(openCmd, () => {});

        console.log('[WAIT] Menunggu callback...\n');
        const params = await serverPromise;
        const result = parseToken(params);

        console.log('\n[SUCCESS] Login berhasil!');
        console.log('Email      :', result.authData.userData.email);
        console.log('User ID    :', result.authData.userData.id);
        console.log('Token      :', result.authData.userData.auth.access_token?.slice(0, 20) + '...');

        return result;

    } finally {
        if (hostsAdded) removeHostsEntry();
    }
}

// Jalankan
if (require.main === module) {
    login({ target: 'login' })
    .then(r => {
        console.log('\n[RESULT]', JSON.stringify(r, null, 2));
        process.exit(0);
    })
    .catch(e => {
        console.error('\n[ERROR]', e.message);
        process.exit(1);
    });
}

module.exports = { login, parseToken, buildAuthUrl: () => {} };
