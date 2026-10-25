"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { phCapture } from "@/lib/analytics/posthog";
import type { LightboxOpen } from "./toolkit-lightbox";
import type { ToolCardData, ToolkitLabels } from "./toolkit-types";

/**
 * The ONLY client code the toolkit cards cost on first load. The cards
 * themselves (diagrams, text) are plain server HTML in toolkit.tsx; this island
 * just wires them up via event delegation on `#analyzer`:
 *   • one IntersectionObserver arms each card's diagram animation (`data-in`),
 *   • click on a `[data-tool]` card opens the lightbox,
 *   • hover/focus warms the lightbox chunk so the first open is instant.
 * The lightbox (Radix Dialog + gallery) is a separate dynamic chunk, mounted
 * only after the first open. Cards remain real <button>s: keyboard and screen
 * readers work as before.
 */
const loadLightbox = () => import("./toolkit-lightbox");
const ToolkitLightbox = dynamic(loadLightbox, { ssr: false });

export function ToolkitController({
  tools,
  labels,
}: {
  tools: ToolCardData[];
  labels: ToolkitLabels;
}) {
  const [open, setOpen] = useState<LightboxOpen>(null);
  const [mounted, setMounted] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.getElementById("analyzer");
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-tool]"));

    // Arm diagram animations when a card first scrolls into view.
    const arm = (el: HTMLElement) => el.setAttribute("data-in", "true");
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") {
      cards.forEach(arm);
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              arm(e.target as HTMLElement);
              io?.unobserve(e.target);
            }
          }
        },
        { rootMargin: "0px 0px -80px 0px" },
      );
      cards.forEach((c) => io!.observe(c));
    }

    const cardOf = (t: EventTarget | null) =>
      (t instanceof Element ? t.closest<HTMLElement>("[data-tool]") : null);
    const onClick = (e: MouseEvent) => {
      const card = cardOf(e.target);
      if (!card) return;
      const i = tools.findIndex((x) => x.id === card.dataset.tool);
      if (i < 0) return;
      opener.current = card;
      phCapture("toolkit_open", { tool: tools[i].id });
      setMounted(true);
      setOpen({ tool: i, idx: 0 });
    };
    const warm = (e: Event) => {
      if (cardOf(e.target)) void loadLightbox();
    };
    root.addEventListener("click", onClick);
    root.addEventListener("pointerover", warm, { passive: true });
    root.addEventListener("focusin", warm);
    return () => {
      io?.disconnect();
      root.removeEventListener("click", onClick);
      root.removeEventListener("pointerover", warm);
      root.removeEventListener("focusin", warm);
    };
  }, [tools]);

  if (!mounted) return null;
  return (
    <ToolkitLightbox tools={tools} labels={labels} open={open} setOpen={setOpen} openerRef={opener} />
  );
}
