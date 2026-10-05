"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CommandMenu = dynamic(
  () => import("@/components/dashboard/command-menu").then((m) => m.CommandMenu),
  { ssr: false },
);

/**
 * The ⌘K palette (cmdk) is mounted in the app layout on every page but is
 * invisible until used. Its code now downloads on the first ⌘/Ctrl+K or click
 * on the search box (`ev:open-command-menu`), and opens straight away once
 * loaded.
 */
export function CommandMenuLazy() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed) return;
    const arm = () => setArmed(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        arm();
      }
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("ev:open-command-menu", arm);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("ev:open-command-menu", arm);
    };
  }, [armed]);

  return armed ? <CommandMenu defaultOpen /> : null;
}
