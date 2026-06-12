import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { useAuthStore } from "./store/auth-store";
import { Login } from "./pages/Login";
import { Status } from "./pages/Status";
import { Tokens } from "./pages/Tokens";
import { Settings } from "./pages/Settings";
import { Logs } from "./pages/Logs";
import { Management } from "./pages/Management";
import { SidebarNav } from "./components/sidebar-nav";
import { Button } from "./components/ui/button";
import { Menu } from "lucide-react";

function getPage(hash: string): string {
  if (hash === "#/login") return "login";
  if (hash === "#/management" || hash === "" || hash === "#/") return "dashboard";
  if (hash.startsWith("#/management/quota")) return "management";
  if (hash.startsWith("#/management/tokens")) return "tokens";
  if (hash.startsWith("#/management/settings")) return "settings";
  if (hash.startsWith("#/management/logs")) return "logs";
  return "dashboard";
}

function App() {
  const [page, setPage] = useState(() => getPage(window.location.hash));
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Wait for Zustand persist rehydration from sessionStorage
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  // Listen for hash changes
  useEffect(() => {
    const onHashChange = () => setPage(getPage(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigateTo = (newPage: string) => {
    let hash = "#/management";
    if (newPage === "login") hash = "#/login";
    else if (newPage === "management") hash = "#/management/quota";
    else if (newPage === "tokens") hash = "#/management/tokens";
    else if (newPage === "settings") hash = "#/management/settings";
    else if (newPage === "logs") hash = "#/management/logs";
    window.location.hash = hash;
  };

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Login onLogin={() => navigateTo("dashboard")} />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "hsl(var(--card))",
              color: "hsl(var(--card-foreground))",
              border: "1px solid hsl(var(--border))",
            },
          }}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <SidebarNav />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full">
            <SidebarNav onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="flex h-14 items-center gap-3 border-b px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-sm">OhMyProxy</span>
        </div>
        <div className="p-4 md:p-6">
          {page === "dashboard" && <Status />}
          {page === "management" && <Management />}
          {page === "tokens" && <Tokens />}
          {page === "settings" && <Settings />}
          {page === "logs" && <Logs />}
        </div>
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
            border: "1px solid hsl(var(--border))",
          },
        }}
      />
    </div>
  );
}

// Mount
const rootEl = document.getElementById("root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
}
