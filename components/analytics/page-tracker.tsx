"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Rastreador de páginas first-party. Envía un beacon a /api/track en cada cambio
 * de ruta. Respeta el mismo opt-out interno que el resto de analítica:
 *   - `isInternal` (servidor: email en INTERNAL_EMAILS)
 *   - localStorage `__ev_no_analytics` (cliente)
 * para que las visitas del dueño no inflen las métricas.
 */
export function PageTracker({ isInternal }: { isInternal?: boolean }) {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (isInternal) return;
    try { if (localStorage.getItem("__ev_no_analytics")) return; } catch { /* ignore */ }
    if (!pathname || last.current === pathname) return;
    last.current = pathname;

    const payload = JSON.stringify({ path: pathname, referrer: document.referrer });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/track", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true });
      }
    } catch { /* nunca rompe la navegación */ }
  }, [pathname, isInternal]);

  return null;
}
