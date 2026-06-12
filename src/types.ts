export interface UiBuild {
  date: string;
  time: string;
  tools_hash: string;
  kb_hash: string;
}

export interface Settings {
  proxy: { port: number; host: string };
  management_key?: string;
  secret_keys: string[];
  postman: {
    base_url: string;
    app_version: string;
    platform: string;
    model: string;
    user_id: string;
    team_id: string;
    workspace_id: string;
    workspace_name?: string;
    file_viewer_path?: string;
    ui_build: UiBuild;
  };
  logging: { enabled: boolean; level: string };
}

export interface AccessToken {
  id: number;
  label: string;
  token: string;
  workspace_id?: string;
  active: boolean;
  note?: string;
}

export interface AnthropicRequest {
  model?: string;
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
  system?: string | Array<{ type: string; text?: string; cache_control?: any }>;
  stream?: boolean;
  max_tokens?: number;
}

export interface ToolCall {
  id: string;
  toolCallGroupId: string;
  function: { name: string; arguments: string };
}

export interface PostmanToolResponse {
  toolCallId: string;
  content: string;
  toolResponseSummary: string;
  toolResponseStatus: "SUCCESS" | "ERROR";
}

export interface PostmanQuota {
  limit: number;
  usage: number;
  cycleStart: string;
  cycleEnd: string;
  usageState: string;
}

export interface PostmanStreamResult {
  text: string;
  toolCalls: ToolCall[];
  conversationId: string;
  done: boolean;
  quota?: PostmanQuota;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
