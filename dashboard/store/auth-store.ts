"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  proxyUrl: string;
  managementKey: string;
  isAuthenticated: boolean;
  setCredentials: (proxyUrl: string, managementKey: string) => void;
  login: () => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      proxyUrl: "http://127.0.0.1:8020",
      managementKey: "",
      isAuthenticated: false,

      setCredentials: (proxyUrl: string, managementKey: string) => {
        set({ proxyUrl, managementKey });
      },

      login: async () => {
        const { proxyUrl, managementKey } = get();
        try {
          const res = await fetch(`${proxyUrl}/management/status`, {
            headers: { "X-Management-Key": managementKey },
          });
          if (res.ok) {
            set({ isAuthenticated: true });
            return true;
          }
          set({ isAuthenticated: false });
          return false;
        } catch {
          set({ isAuthenticated: false });
          return false;
        }
      },

      logout: () => {
        set({ isAuthenticated: false, managementKey: "" });
      },
    }),
    {
      name: "ohmyproxy-auth",
    }
  )
);
