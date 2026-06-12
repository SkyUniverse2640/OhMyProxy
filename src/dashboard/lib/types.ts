export interface ProxyStatus {
  status: string;
  proxy: {
    host: string;
    port: number;
  };
  tokens: {
    total: number;
    active: number;
  };
  model: string;
  logging: {
    enabled: boolean;
    level: string;
  };
}

export interface ProxySettings {
  proxy: {
    host: string;
    port: number;
  };
  api_keys: string[];
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
    ui_build: {
      date: string;
      time: string;
      tools_hash: string;
      kb_hash: string;
    };
  };
  logging: {
    enabled: boolean;
    level: string;
  };
}

export interface TokenItem {
  id: number;
  label: string;
  token: string;
  active: boolean;
  note?: string;
  workspace_id?: string;
}

export interface TokenCreatePayload {
  token: string;
  label?: string;
  active?: boolean;
  note?: string;
}

export interface LogsResponse {
  lines: string[];
  total: number;
}

export interface QuotaTokenStats {
  id: number;
  label: string;
  requestCount: number;
  rateLimitCount: number;
  lastUsed: number | null;
  active: boolean;
  limit: number;
  usage: number;
  cycleStart: string;
  cycleEnd: string;
  usageState: string;
}

export interface QuotaResponse {
  tokens: QuotaTokenStats[];
  total: {
    requests: number;
    rateLimits: number;
  };
}

export interface ApiError {
  error: string;
}
