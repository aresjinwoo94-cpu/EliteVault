"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  CreditCard,
  Compass,
  Library,
  Scan,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const COMMANDS = [
  { label: "Overview", href: "/app", icon: Compass, group: "Navigate" },
  {
    label: "New analysis",
    href: "/app/analyzer",
    icon: Scan,
    group: "Navigate",
  },
  { label: "Library", href: "/app/library", icon: Library, group: "Navigate" },
  {
    label: "Billing",
    href: "/app/billing",
    icon: CreditCard,
    group: "Navigate",
  },
  {
    label: "Settings",
    href: "/app/settings",
    icon: Settings,
    group: "Navigate",
  },
];

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const openHandler = () => setOpen(true);
    document.addEventListener("keydown", down);
    window.addEventListener("ev:open-command-menu", openHandler);
    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("ev:open-command-menu", openHandler);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[18vh] px-4 bg-obsidian-950/70 backdrop-blur-md"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-obsidian-900/95 backdrop-blur-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95"
      >
        <Command className="flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
            <Sparkles className="size-4 text-champagne-400" />
            <Command.Input
              placeholder="Type a command or search…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
            />
            <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-white/40">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-white/40">
              No results.
            </Command.Empty>
            <Command.Group heading="Navigate">
              {COMMANDS.map((c) => (
                <Command.Item
                  key={c.href}
                  value={c.label}
                  onSelect={() => {
                    router.push(c.href);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 cursor-pointer",
                    "data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-white",
                  )}
                >
                  <c.icon className="size-4 text-white/40" />
                  {c.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
