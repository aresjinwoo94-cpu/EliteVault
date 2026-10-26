"use client";

import { useEffect } from "react";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { phCapture } from "@/lib/analytics/posthog";
import { SHARE_EVENTS } from "@/lib/analytics/share-events";

/**
 * "Is this your store?" — shown only when the visitor holds a valid claim token (the owner's outreach link).
 * All copy comes from the server (already translated); this component only owns the click events.
 * The link goes to the claim route, which handles sign-up, the transfer and the redirect.
 */
export function ShareClaimBlock({
  slug,
  claimHref,
  title,
  body,
  cta,
  note,
}: {
  slug: string;
  claimHref: string;
  title: string;
  body: string;
  cta: string;
  note: string;
}) {
  // The token only needs to live in the button's href: drop it from the address bar so it does not sit in browser
  // history, a copied URL, a screenshot or a recording (analytics also redacts it: lib/analytics/redact.ts).
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("c")) {
        u.searchParams.delete("c");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      }
    } catch {
      /* address bar is cosmetic */
    }
  }, []);
  return (
    <Card className="border-signal-400/30 bg-gradient-to-br from-signal-500/[0.08] to-transparent p-5 md:p-6" data-share-block="claim">
      <div className="flex items-start gap-3">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-signal-300" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-display text-xl tracking-tight text-white">{title}</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-white/65">{body}</p>
          <a
            href={claimHref}
            onClick={() => {
              phCapture(SHARE_EVENTS.ctaClick, { share_slug: slug, position: "owner_claim" });
              phCapture(SHARE_EVENTS.claimStart, { share_slug: slug });
            }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-signal-500 px-4 py-2.5 text-sm font-medium text-obsidian-950 transition-colors hover:bg-signal-400"
          >
            {cta}
            <ArrowRight className="size-4" />
          </a>
          <p className="mt-2 text-[11.5px] text-white/40">{note}</p>
        </div>
      </div>
    </Card>
  );
}
