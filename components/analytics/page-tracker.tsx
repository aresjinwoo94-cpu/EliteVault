"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 15000;

/**
 * First-party page tracker + session heartbeat.
 *
 * - Sends ONE `pageview` beacon to /api/track per route change and a
 *   `heartbeat` every ~15s while the tab is visible (visibilitychange +
 *   sendBeacon), so the owner dashboard can show live visitors and session
 *   DURATION. Only pageviews are counted as page views; heartbeats just keep
 *   the session alive. A pageview skipped because the tab is hidden is sent
 *   the first time it becomes visible.
 * - A per-tab `session_id` (sessionStorage) ties the beats to one session.
 * - The session's ORIGINAL referrer + landing query string are captured once
 *   (sessionStorage) and re-sent on every beat, so the server derives the same
 *   channel every time and a hard reload on an internal page (whose
 *   document.referrer is our own site) can't turn "Instagram" into "Directo".
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

    const firstTouch = (() => {
      try {
        const ref = sessionStorage.getItem("ev_ref");
        const land = sessionStorage.getItem("ev_land");
        if (ref !== null && land !== null) return { referrer: ref, landing: land };
        const f = {
          referrer: document.referrer || "",
          landing: location.search || "",
        };
        sessionStorage.setItem("ev_ref", f.referrer);
        sessionStorage.setItem("ev_land", f.landing);
        return f;
      } catch {
        return {
          referrer: document.referrer || "",
          landing: location.search || "",
        };
      }
    })();

    let pageviewSent = false;

    const send = (type: "pageview" | "heartbeat") => {
      const payload = JSON.stringify({
        type,
        path: pathname,
        referrer: firstTouch.referrer,
        landing: firstTouch.landing,
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

    const beat = (wanted: "pageview" | "heartbeat") => {
      if (document.visibilityState === "hidden") return;
      // The first visible beat of a route is always its pageview.
      const type = !pageviewSent ? "pageview" : wanted;
      if (type === "pageview") pageviewSent = true;
      send(type);
    };

    beat("pageview");
    const interval = setInterval(() => beat("heartbeat"), HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") beat("heartbeat");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, isInternal]);

  return null;
}
