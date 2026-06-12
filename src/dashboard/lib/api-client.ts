import { useAuthStore } from "../store/auth-store";

class ApiClient {
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Management-Key": useAuthStore.getState().managementKey,
    };
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = {
      ...this.getHeaders(),
      ...(options.headers as Record<string, string> || {}),
    };

    const res = await fetch(path, { ...options, headers });

    if (res.status === 401) {
      useAuthStore.getState().logout();
      window.location.hash = "#/login";
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  async getStatus() {
    return this.request<import("./types").ProxyStatus>("/management/status");
  }

  async getSettings() {
    return this.request<import("./types").ProxySettings>("/management/settings");
  }

  async patchSettings(body: Record<string, unknown>) {
    return this.request<{ message: string; updated: string[] }>(
      "/management/settings",
      { method: "PATCH", body: JSON.stringify(body) }
    );
  }

  async getTokens() {
    return this.request<import("./types").TokenItem[]>("/management/tokens");
  }

  async addToken(payload: import("./types").TokenCreatePayload) {
    return this.request<{ message: string; id: number }>(
      "/management/tokens",
      { method: "POST", body: JSON.stringify(payload) }
    );
  }

  async deleteToken(id: number) {
    return this.request<{ message: string }>(
      `/management/tokens/${id}`,
      { method: "DELETE" }
    );
  }

  async toggleToken(id: number) {
    return this.request<{ message: string; active: boolean }>(
      `/management/tokens/${id}/toggle`,
      { method: "PATCH" }
    );
  }

  async getLogs() {
    return this.request<import("./types").LogsResponse>("/management/logs");
  }

  async deleteLogs() {
    return this.request<{ message: string }>(
      "/management/logs",
      { method: "DELETE" }
    );
  }

  async getQuota() {
    return this.request<import("./types").QuotaResponse>("/management/quota");
  }

  async refreshQuota(tokenId?: number): Promise<{ refreshed: number; tokens: any[] }> {
    const path = tokenId != null
      ? `/management/quota/refresh/${tokenId}`
      : "/management/quota/refresh";
    return this.request(path, { method: "POST" });
  }
}

export const apiClient = new ApiClient();
