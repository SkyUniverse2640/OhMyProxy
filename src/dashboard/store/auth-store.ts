import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AuthState {
  apiKey: string;
  isAuthenticated: boolean;
  setCredentials: (apiKey: string) => void;
  login: () => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      isAuthenticated: false,

      setCredentials: (apiKey: string) => {
        set({ apiKey });
      },

      login: async () => {
        const { apiKey } = get();
        if (!apiKey) return false;
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
        } catch {
          set({ isAuthenticated: false });
          return false;
        }
      },

      logout: () => {
        set({ isAuthenticated: false, apiKey: "" });
      },
    }),
    {
      name: "ohmyproxy-auth",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
