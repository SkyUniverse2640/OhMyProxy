import type { Settings, AccessToken, AnthropicRequest, PostmanToolResponse, PostmanStreamResult } from './types';
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { Config } from './Config';
import { Logger } from './Logger';
import { TokenManager } from './TokenManager';
import { ToolExecutor } from './ToolExecutor';
import { PayloadBuilder } from './PayloadBuilder';
import { StreamReader } from './StreamReader';
import { ManagementHandler } from './ManagementHandler';
import { VersionChecker } from './VersionChecker';

const CORS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, anthropic-beta',
};

const MAX_TOOL_ROUNDS = 8;

class RateLimiter {
    private windows = new Map<string, { count: number; resetAt: number }>();

    constructor(private maxRequests: number, private windowMs: number, private errorMessage: string) {}

    check(key: string): Response | null {
        const now = Date.now();
        let w = this.windows.get(key);
        if (!w || now >= w.resetAt) {
            w = { count: 0, resetAt: now + this.windowMs };
            this.windows.set(key, w);
        }
        w.count++;
        if (w.count > this.maxRequests) {
            const retryAfter = Math.ceil((w.resetAt - now) / 1000);
            return new Response(
                JSON.stringify({ error: this.errorMessage, retryAfter }),
                                { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) } }
            );
        }
        // Periodic cleanup
        if (this.windows.size > 10_000) {
            for (const [k, v] of this.windows) {
                if (now >= v.resetAt) this.windows.delete(k);
            }
        }
        return null;
    }

    getClientIp(req: Request): string {
        return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? req.headers.get("x-real-ip")
        ?? "127.0.0.1";
    }
}

export class ProxyServer {
    private readonly settings: Settings;
    private readonly logger: Logger;
    private readonly tokens: TokenManager;
    private readonly payload: PayloadBuilder;
    private readonly streamReader: StreamReader;
    private readonly management: ManagementHandler;
    private readonly versionChecker = new VersionChecker("SkyUniverse2640/OhMyProxy");
    private readonly mgmtLimiter = new RateLimiter(30, 60_000, "Too many management requests. Please slow down.");
    private readonly messageLimiter = new RateLimiter(20, 60_000, "Too many proxy requests. Please slow down.");

    constructor(private readonly config: Config) {
        this.settings = config.loadSettings();
        this.logger = new Logger(this.settings, config.getDir());
        this.tokens = new TokenManager(config);
        this.payload = new PayloadBuilder(this.settings);
        this.streamReader = new StreamReader();
        this.management = new ManagementHandler(config, this.tokens, this.versionChecker);
    }

    start(): void {
        const { port, host } = this.settings.proxy;
        const model = this.settings.postman.model;
        const activeCount = this.tokens.getActive().length;

        console.log(`
        SkyUniverse ProxyAPI - http://${host}:${port}
        Model AI      : ${model.padEnd(44)}
        Access Token  :  ${String(activeCount).padEnd(44)}
        Dashboard     :  http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/
        ===============================================
        Go To .claude/settings.json to Setup the Proxy
        `);

        Bun.serve({ port, hostname: host, fetch: (req) => this.handle(req), idleTimeout: 255 });

        // Check for updates (async, non-blocking)
        this.versionChecker.check().then(info => {
            if (info.hasUpdate) {
                console.log(`
                ╔════════════════════════════════════════════════════════╗
                ║  UPDATE AVAILABLE: v${info.latest?.padEnd(34) ?? ""} ║
                ║  Current: v${info.current.padEnd(38)} ║
                ║  ${(info.releaseUrl ?? "").padEnd(52)} ║
                ╚════════════════════════════════════════════════════════╝
                `);
            }
        });

        // Fetch initial quota for all active tokens (async, non-blocking)
        this.fetchInitialQuota();
    }

    private async fetchInitialQuota(): Promise<void> {
        const tokens = this.tokens.getActive();
        if (!tokens.length) return;

        console.log(`\n  ⏳ Fetching initial quota for ${tokens.length} token(s)...`);

        for (const token of tokens) {
            try {
                const resp = await fetch(`${this.settings.postman.base_url}/chat`, {
                    method: "POST",
                    headers: this.payload.headers(token.token),
                                         body: JSON.stringify(this.payload.refreshQuota()),
                                         signal: AbortSignal.timeout(15000),
                });
                if (!resp.ok) {
                    console.log(`  ⚠️  ${token.label}: HTTP ${resp.status}`);
                    continue;
                }
                const result = await this.streamReader.read(resp.body!);
                if (result.quota?.limit) {
                    this.tokens.recordQuota(token.id, result.quota.limit, result.quota.usage, result.quota.cycleStart, result.quota.cycleEnd, result.quota.usageState);
                    const pct = Math.round(((result.quota.limit - result.quota.usage) / result.quota.limit) * 100);
                    console.log(`  ✅ ${token.label}: Usage ${result.quota.usage.toLocaleString()} / ${result.quota.limit.toLocaleString()} (${pct}% remaining)`);
                } else {
                    console.log(`  ⚠️  ${token.label}: No quota data`);
                }
            } catch (e: any) {
                console.log(`  ❌ ${token.label}: ${e.message}`);
            }
        }
        console.log("");
    }

    // ─── HTTP Router ──────────────────────────────────────────────────────

    private async handle(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const { method } = req;
        const path = url.pathname;
        const reqId = Math.random().toString(36).slice(2, 8).toUpperCase();

        if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

        // Rate limit management endpoints
        if (path.startsWith("/management")) {
            const clientIp = this.mgmtLimiter.getClientIp(req);
            const limited = this.mgmtLimiter.check(clientIp);
            if (limited) return limited;
        }

        // Rate limit proxy messages
        if (path === "/v1/messages" && method === "POST") {
            const clientIp = this.messageLimiter.getClientIp(req);
            const limited = this.messageLimiter.check(clientIp);
            if (limited) return limited;
        }

        if (path === '/health') return this.handleHealth();
        if (path === '/v1/context' && method === 'DELETE') return this.json({ message: 'Context cleared (proxy is stateless)' });
        if (path === '/v1/models') return this.json({ data: [{ id: this.settings.postman.model, object: 'model', created: 0, owned_by: 'postman' }] });

        // Quota refresh (POST /management/quota/refresh[/:id])
        if (path.startsWith("/management/quota/refresh")) {
            return this.handleQuotaRefresh(req, path);
        }

        // Management API
        const mgmtResponse = await this.management.handle(req);
        if (mgmtResponse) return mgmtResponse;

        // Dashboard static files (CSS, JS, TSX, TS)
        if (method === "GET" && !path.startsWith("/v1/") && !path.startsWith("/management") && !path.startsWith("/health")) {
            if (path === "/output.css") {
                return this.serveStatic("src/dashboard/output.css", "text/css");
            }
            if (path === "/dist/app.js") {
                return this.serveStatic("src/dashboard/dist/app.js", "application/javascript");
            }
            const ext = path.split(".").pop() || "";
            if (["tsx", "ts", "js", "jsx", "css", "svg", "png", "ico"].includes(ext)) {
                return this.serveDashboardFile(path);
            }
        }

        // Dashboard SPA fallback (non-API GET requests → index.html)
        if (method === "GET" && !path.startsWith("/v1/") && !path.startsWith("/management") && !path.startsWith("/health") && !path.includes(".")) {
            return this.serveDashboard();
        }

        if (path !== '/v1/messages' || method !== 'POST') {
            return this.json({ error: `Route tidak ditemukan: ${method} ${path}` }, 404);
        }

        return this.handleMessages(req, reqId);
    }

    // ─── Dashboard Serving ──────────────────────────────────────────────

    private serveDashboard(): Response {
        const html = readFileSync(join(this.config.getDir(), "src", "dashboard", "index.html"), "utf-8");
        return new Response(html, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    }

    private serveStatic(relPath: string, contentType: string): Response {
        try {
            const fullPath = join(this.config.getDir(), relPath);
            const content = readFileSync(fullPath, "utf-8");
            return new Response(content, {
                headers: {
                    "Content-Type": `${contentType}; charset=utf-8`,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            });
        } catch {
            return new Response("Not found", { status: 404 });
        }
    }

    private serveDashboardFile(path: string): Response {
        // Decode URL-encoded characters (e.g., %2e%2e%2f → ../)
        const decoded = decodeURIComponent(path);
        // Reject paths that differ after decoding (indicates attempted encoding bypass)
        if (decoded !== path && (decoded.includes("..") || decoded.includes("\0"))) {
            return new Response("Forbidden", { status: 403 });
        }
        const cleanPath = path.replace(/^\//, "");
        // Reject any path containing raw traversal sequences
        if (cleanPath.includes("..") || cleanPath.includes("\0")) {
            return new Response("Forbidden", { status: 403 });
        }
        const baseDir = resolve(this.config.getDir(), "src", "dashboard");
        const resolved = resolve(baseDir, cleanPath);
        if (!resolved.startsWith(baseDir + "/") && resolved !== baseDir) {
            return new Response("Forbidden", { status: 403 });
        }
        const file = Bun.file(resolved);

        if (!file.size) {
            return new Response("Not found", { status: 404 });
        }

        const ext = path.split(".").pop() || "";
        const mimeTypes: Record<string, string> = {
            tsx: "text/javascript",
            ts: "text/javascript",
            js: "application/javascript",
            jsx: "application/javascript",
            css: "text/css",
            svg: "image/svg+xml",
            png: "image/png",
            ico: "image/x-icon",
        };

        const contentType = mimeTypes[ext] || "application/octet-stream";

        // Transpile TSX/TS to JS for browser consumption
        if (ext === "tsx" || ext === "ts" || ext === "jsx") {
            try {
                const source = readFileSync(resolved, "utf-8");
                // Use Bun's built-in transpiler to convert TSX → JS
                const transpiler = new Bun.Transpiler({
                    loader: ext === "tsx" ? "tsx" : ext === "jsx" ? "jsx" : "ts",
                    target: "browser",
                });
                const transpiled = transpiler.transformSync(source);
                return new Response(transpiled, {
                    headers: {
                        "Content-Type": "text/javascript; charset=utf-8",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                    },
                });
            } catch {
                // Fallback: serve raw (browser will likely fail parsing, but at least shows the error)
                return new Response(file, {
                    headers: {
                        "Content-Type": "text/javascript; charset=utf-8",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                    },
                });
            }
        }

        return new Response(file, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        });
    }

    // ─── Route Handlers ───────────────────────────────────────────────────

    private async handleQuotaRefresh(req: Request, path: string): Promise<Response> {
        if (req.method !== "POST") return this.json({ error: "Method not allowed" }, 405);
        if (!this.management.isAuthorized(req)) return this.management.unauthorized();

        const idMatch = path.match(/^\/management\/quota\/refresh\/(\d+)$/);
        const targetId = idMatch?.[1] ? parseInt(idMatch[1]) : null;

        const results: any[] = [];
        const tokens = targetId
        ? this.tokens.all().filter(t => t.id === targetId && t.active)
        : this.tokens.getActive();

        for (const token of tokens) {
            try {
                const resp = await fetch(`${this.settings.postman.base_url}/chat`, {
                    method: "POST",
                    headers: this.payload.headers(token.token),
                                         body: JSON.stringify(this.payload.refreshQuota()),
                                         signal: AbortSignal.timeout(15000),
                });
                if (!resp.ok) {
                    results.push({ id: token.id, label: token.label, error: `HTTP ${resp.status}` });
                    continue;
                }
                const result = await this.streamReader.read(resp.body!);
                if (result.quota?.limit) {
                    this.tokens.recordQuota(token.id, result.quota.limit, result.quota.usage, result.quota.cycleStart, result.quota.cycleEnd, result.quota.usageState);
                    results.push({
                        id: token.id,
                        label: token.label,
                        limit: result.quota.limit,
                        usage: result.quota.usage,
                        remaining: result.quota.limit - result.quota.usage,
                        cycleEnd: result.quota.cycleEnd,
                        state: result.quota.usageState,
                    });
                } else {
                    results.push({ id: token.id, label: token.label, warning: "No quota data in response" });
                }
            } catch (e: any) {
                results.push({ id: token.id, label: token.label, error: e.message });
            }
        }

        if (results.length === 0) {
            return this.json({ error: "No active tokens to refresh" }, 404);
        }

        return this.json({ refreshed: results.length, tokens: results });
    }

    private handleHealth(): Response {
        return this.json({
            status: 'ok',
            proxy: 'Postman Proxy',
            port: this.settings.proxy.port,
            active_tokens: this.tokens.getActive().length,
        });
    }

    private async handleTokens(req: Request, method: string): Promise<Response> {
        if (method === 'GET') {
            return this.json(
                this.tokens.all().map((t) => ({
                    ...t,
                    token: `${t.token.slice(0, 8)}...${t.token.slice(-6)}`,
                })),
            );
        }
        if (method === 'POST') {
            const body = await req.json().catch(() => null);
            if (!body?.token) return this.json({ error: "Field 'token' wajib" }, 400);
            const t = this.tokens.add({
                label: body.label ?? `Token ${Date.now()}`,
                                      token: body.token,
                                      active: body.active ?? true,
                                      note: body.note ?? '',
            });
            return this.json({ message: 'Token ditambahkan', id: t.id }, 201);
        }
        return this.json({ error: 'Method not allowed' }, 405);
    }

    private handleTokenById(path: string, method: string): Response {
        if (method !== 'DELETE') return this.json({ error: 'Method not allowed' }, 405);
        const id = parseInt(path.split('/')[2] ?? '');
        return this.tokens.remove(id) ? this.json({ message: `Token #${id} dihapus` }) : this.json({ error: 'Tidak ditemukan' }, 404);
    }

    private handleTokenToggle(path: string, method: string): Response {
        if (method !== 'PATCH') return this.json({ error: 'Method not allowed' }, 405);
        const id = parseInt(path.split('/')[2] ?? '');
        const t = this.tokens.toggle(id);
        return t ? this.json({ message: `Token #${id} ${t.active ? 'aktif' : 'nonaktif'}` }) : this.json({ error: 'Tidak ditemukan' }, 404);
    }

    private async handleMessages(req: Request, reqId: string): Promise<Response> {
        if (!this.validateSecretKey(req)) {
            this.logger.log('warn', `[${reqId}] ❌ SK invalid`);
            return this.json({ type: 'error', error: { type: 'authentication_error', message: 'Invalid API key' } }, 401);
        }

        let body: AnthropicRequest;
        try {
            body = await req.json();
        } catch {
            return this.json({ error: 'Body bukan JSON valid' }, 400);
        }
        if (!body.messages?.length) return this.json({ error: 'messages kosong' }, 400);

        const sysText = this.extractSystemText(body.system);
        if (sysText.includes('Generate a concise, sentence-case title')) {
            this.logger.log('info', `[${reqId}] ⏭️  Skip title-generation`);
            return this.json({
                id: `msg_${reqId}`,
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: '{"title": "Claude Code Session"}' }],
                model: body.model ?? 'claude-sonnet',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 5 },
            });
        }

        const cwd = this.resolveCwd(req, sysText);
        const token = this.tokens.current();
        if (!token) {
            return this.json({ type: 'error', error: { type: 'authentication_error', message: 'Tidak ada token Postman aktif' } }, 503);
        }

        const workspaceId = token.workspace_id?.trim() || this.settings.postman.workspace_id;
        const rawQuery = this.extractLastUserMessage(body);
        const sanitized = this.sanitizeQuery(rawQuery, reqId);

        // Extract @file blocks from query → selectedContext
        const { cleanQuery: userQuery, files: inlineFiles } = this.extractFilesFromQuery(sanitized, reqId);

        // Package system prompt + history as claude-context.md → selectedContext
        const contextFile = this.buildContextFile(body, cwd, reqId);

        // Merge: system context first, then @file contents (preserves Postman's priority order)
        const selectedContext = [...contextFile, ...inlineFiles];

        const echoModel = body.model ?? this.settings.postman.model;

        if (this.isQueryTooLong(userQuery)) {
            this.logger.log('warn', `[${reqId}] ❌ Query too long after sanitize: ${userQuery.length} chars (Postman limit: 10,000). Returning error to client.`);
            return this.json({
                type: 'error',
                error: {
                    type: 'invalid_request_error',
                    message: `Pesan terlalu panjang (${userQuery.length} karakter setelah strip system-reminder). Postman hanya menerima maksimal 10.000 karakter. Coba pecah menjadi beberapa pesan yang lebih pendek.`,
                },
            }, 400);
        }

        this.logger.log('info', `[${reqId}] ✅ [${token.label}] | model:${this.settings.postman.model} | cwd:${cwd}`);

        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        (async () => {
            try {
                await this.runProxyLoop(userQuery, cwd, workspaceId, token, writer, encoder, echoModel, reqId, selectedContext);
            } catch (e: any) {
                this.logger.log('error', `[${reqId}] 💥 Loop error: ${e?.message ?? String(e)}`);
            } finally {
                await writer.close().catch(() => {});
            }
        })();

        return new Response(readable, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...CORS },
        });
    }

    // ─── Proxy Loop ───────────────────────────────────────────────────────

    private async runProxyLoop(query: string, cwd: string, workspaceId: string, token: AccessToken, writer: WritableStreamDefaultWriter<Uint8Array>, encoder: TextEncoder, echoModel: string, reqId: string, contextFile: any[] = []): Promise<void> {
        let conversationId: string | undefined;
        const executor = new ToolExecutor(cwd);

        await this.writeSSE(writer, encoder, 'message_start', {
            type: 'message_start',
            message: { id: `msg_${reqId}`, type: 'message', role: 'assistant', content: [], model: echoModel, stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } },
        });
        await this.writeSSE(writer, encoder, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        await this.writeSSE(writer, encoder, 'ping', { type: 'ping' });

        // Warn about placeholder workspace_id — this is a common root cause of empty responses
        const isPlaceholder = workspaceId === 'your-workspace-id' || workspaceId.trim() === '' || workspaceId.startsWith('your-');
        if (isPlaceholder) {
            this.logger.log('warn', `[${reqId}] ⚠️  workspace_id="${workspaceId}" looks like a placeholder! Postman will likely return empty responses. Fix: set workspace_id in settings.json or per-token.`);
        }

        this.logger.log('info', `[${reqId}] → USER_QUERY | ws:${workspaceId.slice(0, 8)} | base_url:${this.settings.postman.base_url} | model:${this.settings.postman.model} | query="${query.slice(0, 60)}" | ctx=${contextFile.length} file(s)`);
        const firstPayload = this.payload.userQuery(query, cwd, workspaceId, conversationId, contextFile);
        let result = await this.postmanFetch(token, firstPayload, reqId, conversationId);
        if (result.conversationId) conversationId = result.conversationId;
        await this.streamText(writer, encoder, result.text, reqId);
        let pendingToolCalls = result.toolCalls;

        for (let round = 0; round < MAX_TOOL_ROUNDS && pendingToolCalls.length > 0; round++) {
            const toolNames = pendingToolCalls.map((tc) => tc.function.name).join(', ');
            this.logger.log('info', `[${reqId}] 🔧 Tool round ${round + 1}: [${toolNames}]`);

            const toolCallGroupId = pendingToolCalls[0]?.toolCallGroupId || '';
            const toolResponses: PostmanToolResponse[] = [];

            for (const tc of pendingToolCalls) {
                let args: any = {};
                try {
                    args = JSON.parse(tc.function.arguments);
                } catch {}

                const toolResult = await executor.execute(tc.function.name, args);
                const isSuccess = toolResult?.status === 'SUCCESS' || !toolResult?.error;
                const summary = ToolExecutor.summarize(tc.function.name, args, toolResult);

                this.logger.log('info', `[${reqId}]   ${isSuccess ? '✅' : '❌'} ${tc.function.name}(${JSON.stringify(args).slice(0, 60)}) → ${summary}`);

                toolResponses.push({
                    toolCallId: tc.id,
                    content: JSON.stringify(toolResult),
                                   toolResponseSummary: summary,
                                   toolResponseStatus: isSuccess ? 'SUCCESS' : 'ERROR',
                });

                await this.streamText(writer, encoder, `\n*[${tc.function.name}: ${summary}]*\n`, reqId);
            }

            this.logger.log('info', `[${reqId}] → TOOL_RESPONSE | group:${toolCallGroupId.slice(0, 8)} | conv:${conversationId?.slice(0, 8)}`);

            // On tool rounds, context is already established via conversationId — no need to re-send
            const toolPayload = this.payload.toolResponse(conversationId!, toolCallGroupId, toolResponses, cwd, workspaceId);
            result = await this.postmanFetch(token, toolPayload, reqId, conversationId);
            if (result.conversationId) conversationId = result.conversationId;
            await this.streamText(writer, encoder, result.text, reqId);
            pendingToolCalls = result.toolCalls;
        }

        if (pendingToolCalls.length > 0) {
            this.logger.log('warn', `[${reqId}] ⚠️  Max tool rounds (${MAX_TOOL_ROUNDS}) reached`);
            await this.streamText(writer, encoder, `\n[Proxy: max tool rounds reached]\n`, reqId);
        }

        this.logger.log('info', `[${reqId}] ✅ Done | conv:${conversationId?.slice(0, 8) ?? 'none'}`);

        await this.writeSSE(writer, encoder, 'content_block_stop', { type: 'content_block_stop', index: 0 });
        await this.writeSSE(writer, encoder, 'message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 0 },
        });
        await this.writeSSE(writer, encoder, 'message_stop', { type: 'message_stop' });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    private async postmanFetch(token: AccessToken, payload: any, reqId: string, conversationId?: string, retryCount = 0): Promise<PostmanStreamResult> {
        const MAX_RETRIES = 3;

        const resp = await fetch(`${this.settings.postman.base_url}/chat`, {
            method: 'POST',
            headers: this.payload.headers(token.token),
                                 body: JSON.stringify(payload),
                                 signal: AbortSignal.timeout(120_000),
        });

        this.logger.log('debug', `[${reqId}] 🌐 Postman HTTP ${resp.status} ${resp.statusText} | content-type: ${resp.headers.get('content-type') ?? 'n/a'}`);

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            this.logger.log('error', `[${reqId}] ❌ Postman HTTP ${resp.status} | body: ${errText.slice(0, 300)}`);

            if (resp.status === 429 && retryCount < MAX_RETRIES) {
                this.tokens.recordRateLimit(token.id);
                const retryAfter = resp.headers.get('Retry-After');
                const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 2 ** retryCount * 1000;
                this.logger.log('warn', `[${reqId}] ⏳ Rate limited. Retry ${retryCount + 1}/${MAX_RETRIES} in ${waitMs}ms`);
                await new Promise((res) => setTimeout(res, waitMs));

                const nextToken = this.tokens.rotate() ?? token;
                this.logger.log('info', `[${reqId}] 🔄 Rotated to token: ${nextToken.label}`);
                return this.postmanFetch(nextToken, payload, reqId, conversationId, retryCount + 1);
            }

            if (resp.status === 401 && retryCount < MAX_RETRIES) {
                const nextToken = this.tokens.rotate();
                if (nextToken && nextToken.id !== token.id) {
                    this.logger.log('warn', `[${reqId}] 🔄 Token invalid, rotated to: ${nextToken.label}`);
                    return this.postmanFetch(nextToken, payload, reqId, conversationId, retryCount + 1);
                }
            }

            return {
                text: `\n[Proxy: Postman error ${resp.status} after ${retryCount} retries]\n`,
                toolCalls: [],
                conversationId: conversationId ?? '',
                done: true,
            };
        }

        this.tokens.recordRequest(token.id);
        const result = await this.streamReader.read(resp.body!, this.logger, reqId);
        if (result.quota?.limit) {
            this.tokens.recordQuota(token.id, result.quota.limit, result.quota.usage, result.quota.cycleStart, result.quota.cycleEnd, result.quota.usageState);
        }
        this.logger.log('info', `[${reqId}] 📨 postmanFetch result | textLen=${result.text.length} toolCalls=${result.toolCalls.length} conv=${result.conversationId?.slice(0, 8) ?? 'none'}`);
        return result;
    }

    private async streamText(writer: WritableStreamDefaultWriter<Uint8Array>, encoder: TextEncoder, text: string, reqId?: string): Promise<void> {
        if (!text) {
            if (reqId) this.logger.log('debug', `[${reqId}] ⏭️  streamText: empty text, skipping SSE write`);
            return;
        }
        await this.writeSSE(writer, encoder, 'content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text },
        });
    }

    private async writeSSE(writer: WritableStreamDefaultWriter<Uint8Array>, encoder: TextEncoder, type: string, data: object): Promise<void> {
        await writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
    }

    private validateSecretKey(req: Request): boolean {
        const auth = req.headers.get('authorization') ?? '';
        const xkey = req.headers.get('x-api-key') ?? '';
        const sk = auth.replace(/^Bearer\s+/i, '').trim() || xkey.trim();
        return this.config.loadSettings().api_keys.includes(sk);
    }

    private resolveCwd(req: Request, sysText: string): string {
        const xCwd = req.headers.get('x-cwd') ?? '';
        const envCwd = process.env.POSTMAN_CWD ?? '';
        const sysCwd = (() => {
            const m = sysText.match(/(?:cwd|working.?dir(?:ectory)?)[:\s]+([^\n]+)/i);
            return m?.[1]?.trim() ?? '';
        })();
        return this.settings.postman.file_viewer_path?.trim() || xCwd || envCwd || sysCwd || process.cwd();
    }

    private sanitizeQuery(raw: string, reqId: string): string {
        // Strip <system-reminder>...</system-reminder> injected by Claude Code —
        // these are Anthropic-internal meta-instructions irrelevant to Postman
        // and can be hundreds of lines long.
        let q = raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '').trim();

        const stripped = raw.length - q.length;
        if (stripped > 0) {
            this.logger.log('debug', `[${reqId}] ✂️  Stripped ${stripped} chars of <system-reminder> from query (${raw.length} → ${q.length} chars)`);
        }

        return q;
    }

    private isQueryTooLong(query: string): boolean {
        return query.length > 9_500; // Postman hard limit is 10,000 chars
    }

    /**
     * Package system prompt + conversation history as a synthetic markdown file
     * in selectedContext. This is exactly how Postman's own client sends file
     * contents — the query stays short, the context lives in selectedContext.
     *
     * Max size: 80 KB (Postman seems to handle selectedContext separately from
     * the 10,000 char query limit). We truncate from the start of history
     * (oldest messages dropped first) if needed.
     */
    private buildContextFile(body: AnthropicRequest, cwd: string, reqId: string): any[] {
        const MAX_CONTEXT_CHARS = 80_000;

        const sysText = this.extractSystemText(body.system)
        // Strip <system-reminder> from system too
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
        .trim();

        // Build conversation history (all messages except the last user turn,
        // which is already in `query`)
        const historyParts: string[] = [];
        for (let i = 0; i < body.messages.length - 1; i++) {
            const msg = body.messages[i];
            if (!msg) continue;
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            const text = this.extractText(msg.content ?? '').trim();
            if (text) historyParts.push(`### ${role}\n${text}`);
        }

        const sections: string[] = [];
        if (sysText) sections.push(`# System Instructions\n\n${sysText}`);
        if (historyParts.length) sections.push(`# Conversation History\n\n${historyParts.join('\n\n---\n\n')}`);

        if (!sections.length) return [];

        let content = sections.join('\n\n---\n\n');

        // Trim oldest history lines if over limit
        if (content.length > MAX_CONTEXT_CHARS) {
            this.logger.log('warn', `[${reqId}] ✂️  Context file too large (${content.length} chars), trimming oldest history to fit ${MAX_CONTEXT_CHARS} chars`);
            content = content.slice(content.length - MAX_CONTEXT_CHARS);
            // Don't start mid-line
            const nl = content.indexOf('\n');
            if (nl > 0) content = content.slice(nl + 1);
        }

        const filePath = `${cwd}/claude-context.md`;
        this.logger.log('debug', `[${reqId}] 📎 Context file: ${content.length} chars → selectedContext`);

        return [{
            type: "file",
            id: filePath,
            value: {
                type: "file",
                name: "claude-context.md",
                path: filePath,
                size: content.length,
                content,
                extension: ".md",
                lastModified: new Date().toISOString(),
                platform: "desktop",
                accessible: true,
            },
        }];
    }

    /**
     * Claude Code embeds @file references directly inside the user message text
     * as <file_content path="...">...</file_content> blocks.
     *
     * This method extracts all such blocks, converts them to Postman-native
     * selectedContext file entries (identical format to the curl example), and
     * returns the cleaned query (without the embedded blocks) + the file entries.
     *
     * Example input query:
     *   <file_content path="/home/adelle/project/src/foo.ts">
     *   ...800 lines...
     *   </file_content>
     *
     *   review this
     *
     * Output:
     *   cleanQuery  = "review this"
     *   files       = [{ type:"file", value:{ name:"foo.ts", content:"...800 lines..." } }]
     */
    private extractFilesFromQuery(raw: string, reqId: string): { cleanQuery: string; files: any[] } {
        const files: any[] = [];

        // Match <file_content path="...">...</file_content>
        // Also handles antml:document and similar variants Claude Code may use
        const FILE_BLOCK_RE = /<(?:file_content|antml:document)[^>]*?path=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/(?:file_content|antml:document)>/gi;

        let cleanQuery = raw.replace(FILE_BLOCK_RE, (_match, filePath: string, content: string) => {
            const trimmed = content.trim();
            const name = filePath.split('/').pop() ?? filePath;
            const ext = name.includes('.') ? '.' + name.split('.').pop() : '';

            this.logger.log('debug', `[${reqId}] 📎 @file extracted: "${name}" (${trimmed.length} chars) → selectedContext`);

            files.push({
                type: "file",
                id: filePath,
                value: {
                    type: "file",
                    name,
                    path: filePath,
                    size: trimmed.length,
                    content: trimmed,
                    extension: ext,
                    lastModified: new Date().toISOString(),
                       platform: "desktop",
                       accessible: true,
                },
            });

            return ''; // Remove the block from query
        }).trim();

        if (files.length > 0) {
            this.logger.log('info', `[${reqId}] 📎 Extracted ${files.length} @file(s) from query → selectedContext`);
        }

        return { cleanQuery, files };
    }

    private extractLastUserMessage(body: AnthropicRequest): string {
        for (let i = body.messages.length - 1; i >= 0; i--) {
            if (body.messages[i]?.role === 'user') {
                return this.extractText(body.messages[i]?.content ?? '');
            }
        }
        return '';
    }

    private extractText(content: string | Array<{ type: string; text?: string }>): string {
        if (typeof content === 'string') return content;
        return content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n');
    }

    private extractSystemText(system: any): string {
        if (!system) return '';
        if (typeof system === 'string') return system;
        if (Array.isArray(system)) return system.map((s: any) => s?.text ?? '').join('\n');
        return '';
    }

    private json(data: object, status = 200): Response {
        return new Response(JSON.stringify(data, null, 2), {
            status,
            headers: { 'Content-Type': 'application/json', ...CORS },
        });
    }
}
