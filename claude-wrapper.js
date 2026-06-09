#!/usr/bin/env node
/**
 * claude-wrapper.js
 * 
 * Wrapper yang:
 * 1. Intercept semua request ke proxy
 * 2. Auto-inject header x-cwd = process.cwd() di setiap request
 * 3. Forward ke proxy :8020
 * 
 * Cara pakai:
 *   node claude-wrapper.js    ← lalu claude jalan normal
 * 
 * Atau simpan di PATH sebagai "claude-cwd" dan panggil dari manapun
 */

const http = require('http');
const https = require('https');
const { execSync, spawn } = require('child_process');

const PROXY_PORT = 8020;
const INJECT_PORT = 8021; // port lokal wrapper

const cwd = process.cwd();

// Buat mini HTTP server yang inject x-cwd lalu forward ke :8020
const server = http.createServer((req, res) => {
  // Tambah header x-cwd
  req.headers['x-cwd'] = cwd;

  // Forward ke proxy :8020
  const options = {
    hostname: '127.0.0.1',
    port: PROXY_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (e) => {
    res.writeHead(502);
    res.end(`Proxy error: ${e.message}`);
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(INJECT_PORT, '127.0.0.1', () => {
  console.log(`[wrapper] cwd = ${cwd}`);
  console.log(`[wrapper] Forwarding :${INJECT_PORT} → :${PROXY_PORT} dengan x-cwd injected`);

  // Jalanin claude dengan BASE_URL ke wrapper port
  const args = process.argv.slice(2);
  const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${INJECT_PORT}`,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'NanzGabby',
  };

  const claude = spawn('claude', args, {
    stdio: 'inherit',
    env,
    shell: true,
  });

  claude.on('exit', (code) => {
    server.close();
    process.exit(code);
  });
});
