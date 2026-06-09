import type { Settings, AccessToken, AnthropicRequest, PostmanToolResponse, PostmanStreamResult } from "./types";
import { Config } from "./Config";
import { Logger } from "./Logger";
import { TokenManager } from "./TokenManager";
import { ToolExecutor } from "./ToolExecutor";
import { PayloadBuilder } from "./PayloadBuilder";
import { StreamReader } from "./StreamReader";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta",
};

const MAX_TOOL_ROUNDS = 8;

export class ProxyServer {
  private readonly settings: Settings;
  private readonly logger: Logger;
  private readonly tokens: TokenManager;
  private readonly payload: PayloadBuilder;
  private readonly streamReader: StreamReader;

  constructor(private readonly config: Config) {
    this.settings = config.loadSettings();
    this.logger = new Logger(this.settings);
    this.tokens = new TokenManager(config);
    this.payload = new PayloadBuilder(this.settings);
    this.streamReader = new StreamReader();
  }

  start(): void {
    const { port, host } = this.settings.proxy;
    const model = this.settings.postman.model;
    const activeCount = this.tokens.getActive().length;

    console.log(`
      SkyUniverse ProxyAPI - https://${host}:${port}
      Model AI      : ${model.padEnd(44)}
      Access Token  :  ${String(activeCount).padEnd(44)}
      ===============================================
      Go To .claude/settings.json to Setup the Proxy
`);

    Bun.serve({ port, hostname: host, fetch: (req) => this.handle(req), idleTimeout: 255 });
  }

  // ─── HTTP Router ──────────────────────────────────────────────────────

  private async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { method } = req;
    const path = url.pathname;
    const reqId = Math.random().toString(36).slice(2, 8).toUpperCase();

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (path === "/" || path === "/health") return this.handleHealth();
    if (path === "/tokens")               return this.handleTokens(req, method);
    if (path.match(/^\/tokens\/\d+$/))    return this.handleTokenById(path, method);
    if (path.match(/^\/tokens\/\d+\/toggle$/)) return this.handleTokenToggle(path, method);
    if (path === "/v1/context" && method === "DELETE") return this.json({ message: "Context cleared (proxy is stateless)" });
    if (path === "/v1/models") return this.json({ data: [{ id: this.settings.postman.model, object: "model", created: 0, owned_by: "postman" }] });

    if (path !== "/v1/messages" || method !== "POST") {
      return this.json({ error: `Route tidak ditemukan: ${method} ${path}` }, 404);
    }

    return this.handleMessages(req, reqId);
  }

  // ─── Route Handlers ───────────────────────────────────────────────────

  private handleHealth(): Response {
    return this.json({
      status: "ok",
      proxy: "Postman Proxy",
      port: this.settings.proxy.port,
      active_tokens: this.tokens.getActive().length,
    });
  }

  private async handleTokens(req: Request, method: string): Promise<Response> {
    if (method === "GET") {
      return this.json(this.tokens.all().map(t => ({
        ...t,
        token: `${t.token.slice(0, 8)}...${t.token.slice(-6)}`,
      })));
    }
    if (method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body?.token) return this.json({ error: "Field 'token' wajib" }, 400);
      const t = this.tokens.add({
        label: body.label ?? `Token ${Date.now()}`,
        token: body.token,
        active: body.active ?? true,
        note: body.note ?? "",
      });
      return this.json({ message: "Token ditambahkan", id: t.id }, 201);
    }
    return this.json({ error: "Method not allowed" }, 405);
  }

  private handleTokenById(path: string, method: string): Response {
    if (method !== "DELETE") return this.json({ error: "Method not allowed" }, 405);
    const id = parseInt(path.split("/")[2]);
    return this.tokens.remove(id)
      ? this.json({ message: `Token #${id} dihapus` })
      : this.json({ error: "Tidak ditemukan" }, 404);
  }

  private handleTokenToggle(path: string, method: string): Response {
    if (method !== "PATCH") return this.json({ error: "Method not allowed" }, 405);
    const id = parseInt(path.split("/")[2]);
    const t = this.tokens.toggle(id);
    return t
      ? this.json({ message: `Token #${id} ${t.active ? "aktif" : "nonaktif"}` })
      : this.json({ error: "Tidak ditemukan" }, 404);
  }

  private async handleMessages(req: Request, reqId: string): Promise<Response> {
    if (!this.validateSecretKey(req)) {
      this.logger.log("warn", `[${reqId}] ❌ SK invalid`);
      return this.json({ type: "error", error: { type: "authentication_error", message: "Invalid API key" } }, 401);
    }

    let body: AnthropicRequest;
    try { body = await req.json(); }
    catch { return this.json({ error: "Body bukan JSON valid" }, 400); }
    if (!body.messages?.length) return this.json({ error: "messages kosong" }, 400);

    const sysText = this.extractSystemText(body.system);
    if (sysText.includes("Generate a concise, sentence-case title")) {
      this.logger.log("info", `[${reqId}] ⏭️  Skip title-generation`);
      return this.json({
        id: `msg_${reqId}`, type: "message", role: "assistant",
        content: [{ type: "text", text: '{"title": "Claude Code Session"}' }],
        model: body.model ?? "claude-sonnet",
        stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 5 },
      });
    }

    const cwd = this.resolveCwd(req, sysText);
    const token = this.tokens.current();
    if (!token) {
      return this.json({ type: "error", error: { type: "authentication_error", message: "Tidak ada token Postman aktif" } }, 503);
    }

    const workspaceId = token.workspace_id?.trim() || this.settings.postman.workspace_id;
    const userQuery = this.extractLastUserMessage(body);
    const echoModel = body.model ?? this.settings.postman.model;

    this.logger.log("info", `[${reqId}] ✅ [${token.label}] | model:${this.settings.postman.model} | cwd:${cwd}`);

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        await this.runProxyLoop(userQuery, cwd, workspaceId, token, writer, encoder, echoModel, reqId);
      } catch (e: any) {
        this.logger.log("error", `[${reqId}] 💥 Loop error: ${e.message}`);
      } finally {
        await writer.close().catch(() => {});
      }
    })();

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...CORS },
    });
  }

  // ─── Proxy Loop ───────────────────────────────────────────────────────

  private async runProxyLoop(
    query: string,
    cwd: string,
    workspaceId: string,
    token: AccessToken,
    writer: WritableStreamDefaultWriter<Uint8Array>,
    encoder: TextEncoder,
    echoModel: string,
    reqId: string,
  ): Promise<void> {
    let conversationId: string | undefined;
    const executor = new ToolExecutor(cwd);

    await this.writeSSE(writer, encoder, "message_start", {
      type: "message_start",
      message: { id: `msg_${reqId}`, type: "message", role: "assistant", content: [], model: echoModel, stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } },
    });
    await this.writeSSE(writer, encoder, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    await this.writeSSE(writer, encoder, "ping", { type: "ping" });

    this.logger.log("info", `[${reqId}] → USER_QUERY | ws:${workspaceId.slice(0, 8)} | cwd:${cwd}`);
    const firstPayload = this.payload.userQuery(query, cwd, workspaceId);
    let result = await this.postmanFetch(token, firstPayload, reqId, conversationId);
    if (result.conversationId) conversationId = result.conversationId;
    await this.streamText(writer, encoder, result.text);
    let pendingToolCalls = result.toolCalls;

    for (let round = 0; round < MAX_TOOL_ROUNDS && pendingToolCalls.length > 0; round++) {
      const toolNames = pendingToolCalls.map(tc => tc.function.name).join(", ");
      this.logger.log("info", `[${reqId}] 🔧 Tool round ${round + 1}: [${toolNames}]`);

      const toolCallGroupId = pendingToolCalls[0]?.toolCallGroupId || "";
      const toolResponses: PostmanToolResponse[] = [];

      for (const tc of pendingToolCalls) {
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}

        const toolResult = executor.execute(tc.function.name, args);
        const isSuccess = toolResult?.status === "SUCCESS" || !toolResult?.error;
        const summary = ToolExecutor.summarize(tc.function.name, args, toolResult);

        this.logger.log("info", `[${reqId}]   ${isSuccess ? "✅" : "❌"} ${tc.function.name}(${JSON.stringify(args).slice(0, 60)}) → ${summary}`);

        toolResponses.push({
          toolCallId: tc.id,
          content: JSON.stringify(toolResult),
          toolResponseSummary: summary,
          toolResponseStatus: isSuccess ? "SUCCESS" : "ERROR",
        });

        await this.streamText(writer, encoder, `\n*[${tc.function.name}: ${summary}]*\n`);
      }

      this.logger.log("info", `[${reqId}] → TOOL_RESPONSE | group:${toolCallGroupId.slice(0, 8)} | conv:${conversationId?.slice(0, 8)}`);

      const toolPayload = this.payload.toolResponse(conversationId!, toolCallGroupId, toolResponses, cwd, workspaceId);
      result = await this.postmanFetch(token, toolPayload, reqId, conversationId);
      if (result.conversationId) conversationId = result.conversationId;
      await this.streamText(writer, encoder, result.text);
      pendingToolCalls = result.toolCalls;
    }

    if (pendingToolCalls.length > 0) {
      this.logger.log("warn", `[${reqId}] ⚠️  Max tool rounds (${MAX_TOOL_ROUNDS}) reached`);
      await this.streamText(writer, encoder, `\n[Proxy: max tool rounds reached]\n`);
    }

    this.logger.log("info", `[${reqId}] ✅ Done | conv:${conversationId?.slice(0, 8) ?? "none"}`);

    await this.writeSSE(writer, encoder, "content_block_stop", { type: "content_block_stop", index: 0 });
    await this.writeSSE(writer, encoder, "message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 0 },
    });
    await this.writeSSE(writer, encoder, "message_stop", { type: "message_stop" });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async postmanFetch(token: AccessToken, payload: any, reqId: string, conversationId?: string): Promise<PostmanStreamResult> {
    const resp = await fetch(`${this.settings.postman.base_url}/chat`, {
      method: "POST",
      headers: this.payload.headers(token.token),
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      this.logger.log("error", `[${reqId}] ❌ Postman ${resp.status}: ${errText.slice(0, 200)}`);
      return { text: `\n[Proxy: Postman error ${resp.status}]\n`, toolCalls: [], conversationId: conversationId ?? "", done: true };
    }
    return this.streamReader.read(resp.body!);
  }

  private async streamText(writer: WritableStreamDefaultWriter<Uint8Array>, encoder: TextEncoder, text: string): Promise<void> {
    if (!text) return;
    await this.writeSSE(writer, encoder, "content_block_delta", {
      type: "content_block_delta", index: 0,
      delta: { type: "text_delta", text },
    });
  }

  private async writeSSE(writer: WritableStreamDefaultWriter<Uint8Array>, encoder: TextEncoder, type: string, data: object): Promise<void> {
    await writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
  }

  private validateSecretKey(req: Request): boolean {
    const auth = req.headers.get("authorization") ?? "";
    const xkey = req.headers.get("x-api-key") ?? "";
    const sk = auth.replace(/^Bearer\s+/i, "").trim() || xkey.trim();
    return this.settings.secret_keys.includes(sk);
  }

  private resolveCwd(req: Request, sysText: string): string {
    const xCwd = req.headers.get("x-cwd") ?? "";
    const envCwd = process.env.POSTMAN_CWD ?? "";
    const sysCwd = (() => {
      const m = sysText.match(/(?:cwd|working.?dir(?:ectory)?)[:\s]+([^\n]+)/i);
      return m?.[1]?.trim() ?? "";
    })();
    return this.settings.postman.file_viewer_path?.trim() || xCwd || envCwd || sysCwd || process.cwd();
  }

  private extractLastUserMessage(body: AnthropicRequest): string {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      if (body.messages[i].role === "user") {
        return this.extractText(body.messages[i].content);
      }
    }
    return "";
  }

  private extractText(content: string | Array<{ type: string; text?: string }>): string {
    if (typeof content === "string") return content;
    return content.filter(c => c.type === "text").map(c => c.text ?? "").join("\n");
  }

  private extractSystemText(system: any): string {
    if (!system) return "";
    if (typeof system === "string") return system;
    if (Array.isArray(system)) return system.map((s: any) => s?.text ?? "").join("\n");
    return "";
  }

  private json(data: object, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
