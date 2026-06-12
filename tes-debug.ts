/**
 * Postman OAuth v2 - dengan debug mode
 * Menerima GET dan POST ke semua path di callback server
 */
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = 10506;
const APP_ID = 'erisedstraehruoytubecafruoytonwohsi';

function startDebugServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', d => body += d);
            req.on('end', () => {
                const fullUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
                const params = Object.fromEntries(fullUrl.searchParams.entries());

                console.log('\n[SERVER] Request masuk!');
                console.log('  Method:', req.method);
                console.log('  Path  :', fullUrl.pathname);
                console.log('  Params:', JSON.stringify(params, null, 4));
                if (body) console.log('  Body  :', body);

                res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
                res.end(`
                <html><body style="font-family:system-ui;padding:2rem;text-align:center">
                <h2 style="color:#ff6c37">✓ Login Berhasil</h2>
                <p>Silakan tutup tab ini dan kembali ke terminal.</p>
                </body></html>
                `);

                // Cek apakah ada token di params
                if (params.access_token || params.user_id || params.multi_login_token) {
                    console.log('\n[AUTH] Token ditemukan!');
                    server.close();
                    resolve({ params, body, method: req.method, path: fullUrl.pathname });
                } else {
                    console.log('[SERVER] Request diterima tapi belum ada token, tetap menunggu...');
                }
            });
        });

        server.on('error', reject);
        server.listen(PORT, '127.0.0.1', () => {
            console.log(`[SERVER] Aktif di http://127.0.0.1:${PORT}`);
        });

        setTimeout(() => {
            server.close();
            reject(new Error('Timeout 5 menit'));
        }, 5 * 60 * 1000);
    });
}

async function main() {
    const authFlowId = crypto.randomUUID();
    const redirectUri = `http://127.0.0.1:${PORT}/auth/callback`;

    const loginUrl = `https://identity.getpostman.com/accounts?` +
    `app_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&authFlowId=${authFlowId}`;

    console.log('='.repeat(60));
    console.log('Postman OAuth Debug');
    console.log('='.repeat(60));
    console.log('authFlowId:', authFlowId);
    console.log('redirectUri:', redirectUri);
    console.log('');
    console.log('Buka URL ini di browser, lalu login:');
    console.log(loginUrl);
    console.log('');

    // Auto-buka browser jika bisa
    const platform = process.platform;
    const openCmd = platform === 'win32' ? `start "" "${loginUrl}"`
    : platform === 'darwin' ? `open "${loginUrl}"`
    : `xdg-open "${loginUrl}"`;
    exec(openCmd, () => {});

    const serverPromise = startDebugServer();
    console.log('[WAIT] Menunggu callback dari identity server...');

    try {
        const result = await serverPromise;
        console.log('\n[RESULT] Data yang diterima:');
        console.log(JSON.stringify(result, null, 2));
    } catch(e) {
        console.error('[ERROR]', e.message);
    }
}

main();
