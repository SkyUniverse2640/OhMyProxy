import { cn } from "../lib/utils";
import {
  LayoutDashboard, Key, Settings, ScrollText, Shield, LogOut, X,
} from "lucide-react";
import { useAuthStore } from "../store/auth-store";
import { Button } from "./ui/button";

const navItems = [
  { href: "#/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "#/dashboard/tokens", label: "Tokens", icon: Key },
  { href: "#/dashboard/settings", label: "Settings", icon: Settings },
  { href: "#/dashboard/logs", label: "Logs", icon: ScrollText },
];

interface SidebarNavProps {
  onClose?: () => void;
}

export function SidebarNav({ onClose }: SidebarNavProps) {
  const pathname = window.location.hash || "#/dashboard";
  const logout = useAuthStore((s) => s.logout);

  const handleNav = () => {
    if (onClose) onClose();
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold">OhMyProxy</span>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={handleNav}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-accent-foreground"
          onClick={() => {
            logout();
            window.location.hash = "#/login";
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
