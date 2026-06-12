import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AuthState {
  managementKey: string;
  isAuthenticated: boolean;
  setCredentials: (managementKey: string) => void;
  login: () => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      managementKey: "",
      isAuthenticated: false,

      setCredentials: (managementKey: string) => {
        set({ managementKey });
      },

      login: async () => {
        const { managementKey } = get();
        try {
          const res = await fetch("/management/status", {
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
      storage: createJSONStorage(() => localStorage),
    }
  )
);
