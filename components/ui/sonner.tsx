"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!bg-obsidian-900/95 !border-white/10 !text-white !backdrop-blur-2xl !shadow-2xl",
          description: "!text-white/60",
          actionButton: "!bg-champagne-400 !text-obsidian-900",
          cancelButton: "!bg-white/5 !text-white",
        },
      }}
    />
  );
}
