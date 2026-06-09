import type { ToolCall, PostmanStreamResult } from "./types";

export class StreamReader {
  async read(stream: ReadableStream<Uint8Array>): Promise<PostmanStreamResult> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let buffer = "";
    let fullText = "";
    let conversationId = "";
    const toolCallsMap = new Map<string, ToolCall>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        this.processLine(line.trim(), toolCallsMap, (t) => { fullText += t; }, (id) => { conversationId = id; });
      }
    }

    if (buffer.trim().startsWith("data: ")) {
      try {
        const event = JSON.parse(buffer.trim().slice(6));
        if (event?.eventType === "textChunk") fullText += event?.data?.textContent ?? "";
      } catch {}
    }

    reader.releaseLock();
    const toolCalls = [...toolCallsMap.values()].filter(tc => tc.function.name);
    return { text: fullText, toolCalls, conversationId, done: true };
  }

  private processLine(
    line: string,
    toolCallsMap: Map<string, ToolCall>,
    onText: (t: string) => void,
    onConversation: (id: string) => void,
  ): void {
    if (!line.startsWith("data: ")) return;
    const raw = line.slice(6);
    if (raw === "[DONE]") return;

    try {
      const event = JSON.parse(raw);
      const et = event?.eventType;

      if (et === "textChunk") {
        onText(event?.data?.textContent ?? "");
      } else if (et === "conversation") {
        onConversation(event?.data?.id ?? "");
      } else if (et === "toolCallChunk") {
        for (const tc of (event?.data?.toolCalls ?? [])) {
          const existing = toolCallsMap.get(tc.id);
          if (existing) {
            existing.function.arguments += tc.function?.arguments ?? "";
          } else {
            toolCallsMap.set(tc.id, {
              id: tc.id,
              toolCallGroupId: tc.toolCallGroupId ?? "",
              function: {
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              },
            });
          }
        }
      }
    } catch {}
  }
}
