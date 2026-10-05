"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const SupportChat = dynamic(
  () => import("@/components/support/support-chat").then((m) => m.SupportChat),
  { ssr: false },
);

/**
 * The floating support launcher is mounted on every page of the site, but
 * nobody needs it during load. Its JS (and the render of its button) now wait
 * until the browser is idle after `load`, so it never competes with the page's
 * own scripts or — on the checkout — with Stripe.
 */
export function SupportChatLazy() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const arm = () => {
      timer = window.setTimeout(() => {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(() => setReady(true), { timeout: 3000 });
        } else {
          setReady(true);
        }
      }, 1500);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      window.removeEventListener("load", arm);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return ready ? <SupportChat /> : null;
}
