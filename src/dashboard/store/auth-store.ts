import { create } from "zustand";

interface AuthState {
  apiKey: string;
  isAuthenticated: boolean;
  setCredentials: (apiKey: string) => void;
  login: () => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  apiKey: "",
  isAuthenticated: false,

  setCredentials: (apiKey: string) => {
    set({ apiKey });
  },

  login: async () => {
    const { apiKey } = get();
    try {
      const res = await fetch("/management/status", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        set({ isAuthenticated: true });
        return true;
      }
      set({ isAuthenticated: false });
      return false;
    } catch (e: any) {
      console.error("Login error:", e.message || e);
      set({ isAuthenticated: false });
      return false;
    }
  },

  logout: () => {
    set({ isAuthenticated: false, apiKey: "" });
  },
}));
