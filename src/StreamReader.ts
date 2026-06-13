import type { ToolCall, PostmanStreamResult, PostmanQuota, LogLevel } from "./types";

// Minimal logger interface so StreamReader doesn't import the full Logger class
interface ILogger {
  log(level: LogLevel, msg: string): void;
}

const NOOP_LOGGER: ILogger = { log: () => {} };

export class StreamReader {
  /**
   * Read a Postman SSE stream and parse all events.
   *
   * @param stream   The raw ReadableStream from fetch().body
   * @param logger   Optional logger (same Logger instance from ProxyServer)
   * @param reqId    Optional request ID for log correlation
   */
  async read(
    stream: ReadableStream<Uint8Array>,
    logger: ILogger = NOOP_LOGGER,
    reqId: string = "-",
  ): Promise<PostmanStreamResult> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();

    let buffer = "";
    let fullText = "";
    let conversationId = "";
    let streamingFormat: string | undefined;
    let quota: PostmanQuota | undefined;
    const toolCallsMap = new Map<string, ToolCall>();

    // Counters for end-of-stream summary
    let totalLines = 0;
    let totalEvents = 0;
    let totalThinkingChunks = 0;
    let totalTextChunks = 0;
    const unknownEventTypes = new Set<string>();

    const processEvent = (raw: string) => {
      if (raw === "[DONE]") return;

      let event: any;
      try {
        event = JSON.parse(raw);
      } catch (e) {
        logger.log("warn", `[${reqId}] ⚠️  SSE parse error: ${String(e)} | raw="${raw.slice(0, 80)}"`);
        return;
      }

      const et: string = event?.eventType ?? "(missing)";
      totalEvents++;

      // Debug log every event (only fires when log level = debug)
      const dataKeys = Object.keys(event?.data ?? {}).join(", ");
      logger.log("debug", `[${reqId}] 📡 SSE eventType="${et}" | data keys: [${dataKeys}]`);

      switch (et) {
        // ── Main content events ──────────────────────────────────────────
        case "textChunk": {
          const chunk: string = event?.data?.textContent ?? "";
          fullText += chunk;
          totalTextChunks++;
          break;
        }

        // ── Thinking events (extended thinking / CoT) ────────────────────
        case "thinkingChunk": {
          // We intentionally DON'T surface thinking content to Claude Code
          // (it's internal reasoning). Just count them for the log summary.
          totalThinkingChunks++;
          break;
        }

        case "thinkingComplete": {
          const ms: number = event?.data?.thinkingDurationInMs ?? 0;
          logger.log("debug", `[${reqId}] 🧠 Thinking complete in ${ms}ms`);
          break;
        }

        // ── Conversation metadata ────────────────────────────────────────
        case "conversation": {
          const id: string = event?.data?.id ?? "";
          if (id) {
            conversationId = id;
            logger.log("debug", `[${reqId}] 💬 conversationId=${id.slice(0, 8)}... name="${event?.data?.name ?? ""}"`);
          }
          break;
        }

        // ── Quota / usage ────────────────────────────────────────────────
        case "usage": {
          quota = {
            limit:       event?.data?.limit        ?? 0,
            usage:       event?.data?.usage        ?? 0,
            cycleStart:  event?.data?.usageCycle?.start ?? "",
            cycleEnd:    event?.data?.usageCycle?.end   ?? "",
            usageState:  event?.data?.usageState   ?? "AVAILABLE",
          };
          const remaining = quota.limit - quota.usage;
          const pct = quota.limit > 0 ? Math.round((remaining / quota.limit) * 100) : 0;
          logger.log("debug", `[${reqId}] 📊 Quota: ${quota.usage.toLocaleString()} / ${quota.limit.toLocaleString()} used (${pct}% remaining) | state=${quota.usageState}`);
          break;
        }

        // ── Tool calls ───────────────────────────────────────────────────
        case "toolCallChunk": {
          for (const tc of (event?.data?.toolCalls ?? [])) {
            const existing = toolCallsMap.get(tc.id);
            if (existing) {
              existing.function.arguments += tc.function?.arguments ?? "";
            } else {
              toolCallsMap.set(tc.id, {
                id: tc.id,
                toolCallGroupId: tc.toolCallGroupId ?? "",
                function: {
                  name:      tc.function?.name      ?? "",
                  arguments: tc.function?.arguments ?? "",
                },
              });
              logger.log("debug", `[${reqId}] 🔧 New toolCall: ${tc.function?.name ?? "?"} id=${String(tc.id).slice(0, 8)}`);
            }
          }
          break;
        }

        // ── Stream metadata ──────────────────────────────────────────────
        case "streamingFormat": {
          streamingFormat = event?.data as string;
          logger.log("debug", `[${reqId}] 📄 streamingFormat="${streamingFormat}"`);
          break;
        }

        case "info": {
          const msg: string = event?.data?.message ?? "";
          logger.log("debug", `[${reqId}] ℹ️  Postman info: "${msg}"`);
          break;
        }

        case "progressUpdate": {
          const text: string = event?.data?.textContent ?? "";
          logger.log("debug", `[${reqId}] 🔄 progressUpdate: "${text.slice(0, 80)}"`);
          break;
        }

        case "planningChunk": {
          const text: string = event?.data?.textContent ?? "";
          logger.log("debug", `[${reqId}] 🗺️  planningChunk: "${text.slice(0, 80)}"`);
          break;
        }

        case "failure": {
          const errorType: string  = event?.data?.errorType   ?? "UNKNOWN";
          const userMsg: string    = event?.data?.userMessage  ?? "";
          const internalMsg: string = event?.data?.message     ?? "";
          logger.log("error",
                     `[${reqId}] 💥 Postman failure event! ` +
                     `errorType="${errorType}" | userMessage="${userMsg}" | message="${internalMsg}"`,
          );
          // Surface the error to the user as text so Claude Code sees it
          fullText += `\n[Postman Error — ${errorType}] ${userMsg || internalMsg}\n`;
          break;
        }

        case "recommendNextActionsChunk": {
          const actions: any[] = event?.data?.actions ?? [];
          logger.log("debug", `[${reqId}] 💡 Postman recommended ${actions.length} next action(s)`);
          break;
        }

        // ── Unknown ──────────────────────────────────────────────────────
        default: {
          unknownEventTypes.add(et);
          // Log at warn so it's visible even without debug level
          logger.log("warn", `[${reqId}] ❓ Unknown eventType="${et}" (data keys: [${dataKeys}]) — skipped`);
          break;
        }
      }
    };

    // ── Main read loop ──────────────────────────────────────────────────────
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        totalLines++;
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        processEvent(trimmed.slice(6));
      }
    }

    // Flush any remaining data in buffer
    if (buffer.trim().startsWith("data: ")) {
      totalLines++;
      processEvent(buffer.trim().slice(6));
    }

    reader.releaseLock();

    // ── End-of-stream summary ─────────────────────────────────────────────
    const toolCalls = [...toolCallsMap.values()].filter((tc) => tc.function.name);

    logger.log("info",
               `[${reqId}] 📥 Stream done | lines=${totalLines} events=${totalEvents} ` +
               `textChunks=${totalTextChunks} thinkingChunks=${totalThinkingChunks} ` +
               `textLen=${fullText.length} toolCalls=${toolCalls.length} ` +
               `conv=${conversationId ? conversationId.slice(0, 8) + "..." : "none"}` +
               (streamingFormat ? ` format="${streamingFormat}"` : ""),
    );

    if (unknownEventTypes.size > 0) {
      logger.log("warn", `[${reqId}] ⚠️  Unknown event types encountered: [${[...unknownEventTypes].join(", ")}]`);
    }

    if (!fullText && toolCalls.length === 0) {
      logger.log("warn",
                 `[${reqId}] ⚠️  Stream produced EMPTY text AND no tool calls! ` +
                 `(${totalEvents} events parsed). Check: workspace_id placeholder, token validity, or new event format.`,
      );
    }

    return { text: fullText, toolCalls, conversationId, done: true, quota };
  }
}
