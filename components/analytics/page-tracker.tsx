"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 15000;

/**
 * First-party page tracker + session heartbeat.
 *
 * - Sends a beacon to /api/track on every route change AND every ~15s while
 *   the tab is visible (visibilitychange + sendBeacon), so the owner dashboard
 *   can show live visitors and session DURATION (server upserts `sessions`).
 * - A per-tab `session_id` (sessionStorage) ties the beats to one session.
 * - Internal traffic (owner/admin via INTERNAL_EMAILS, or the localStorage
 *   `__ev_no_analytics` opt-out) is STILL sent — flagged `internal: true` — so
 *   the owner can verify tracking works, but the server keeps it out of
 *   page_views so it never inflates the public metrics.
 */
export function PageTracker({ isInternal }: { isInternal?: boolean }) {
  const pathname = usePathname();
  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    // Resolve/persist a stable per-tab session id.
    if (!sessionId.current) {
      try {
        let sid = sessionStorage.getItem("ev_sid");
        if (!sid) {
          sid =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : String(Date.now()) + Math.random().toString(36).slice(2);
          sessionStorage.setItem("ev_sid", sid);
        }
        sessionId.current = sid;
      } catch {
        sessionId.current =
          String(Date.now()) + Math.random().toString(36).slice(2);
      }
    }

    const internal = (() => {
      if (isInternal) return true;
      try {
        return !!localStorage.getItem("__ev_no_analytics");
      } catch {
        return false;
      }
    })();

    const beat = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      )
        return;
      const payload = JSON.stringify({
        path: pathname,
        referrer: typeof document !== "undefined" ? document.referrer : "",
        session_id: sessionId.current,
        internal,
      });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/track",
            new Blob([payload], { type: "application/json" }),
          );
        } else {
          fetch("/api/track", {
            method: "POST",
            body: payload,
            headers: { "Content-Type": "application/json" },
            keepalive: true,
          });
        }
      } catch {
        /* never break navigation */
      }
    };

    // Beat immediately on mount / route change, then on a heartbeat interval,
    // and again whenever the tab becomes visible.
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, isInternal]);

  return null;
}
