"use client";

import { useState } from "react";
import { ChevronDown, Quote, ThumbsDown, ThumbsUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PersonaResponse } from "./persona-response";

interface PersonaResponseData {
  headline: string;
  quotes: string[];
  would_buy: boolean;
  reasons: string[];
}

/**
 * Degraded Buyer-Persona presentation (Fase 2 P1-4).
 *
 * The persona reaction stays in the report — it's the most quotable,
 * screenshot-worthy line the product produces ("I'd bounce — the offer isn't
 * obvious in the first 2 seconds") and a row EliteVault wins in the landing
 * comparison. But it must stop competing with the Meta block for attention,
 * so it's demoted from a full-width section to a COMPACT support card:
 * avatar + verdict + the headline + one quote, with a "See full reaction"
 * toggle that expands the complete PersonaResponse.
 *
 * When `metaLinked` is true we tie it to the Meta block — the persona is the
 * audience the optimizer's targets were calibrated for — so it reinforces the
 * Meta story instead of reading as a loose extra feature.
 */
export function PersonaAside({
  response,
  metaLinked = false,
}: {
  response: PersonaResponseData;
  metaLinked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const firstQuote = response.quotes?.[0];

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        {/* Persona avatar chip */}
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-signal-600/10 ring-1 ring-signal-500/20">
          <Quote className="size-4 text-signal-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              Buyer-persona reaction
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px]",
                response.would_buy ? "text-success" : "text-destructive",
              )}
            >
              {response.would_buy ? (
                <>
                  <ThumbsUp className="size-3" /> Would buy
                </>
              ) : (
                <>
                  <ThumbsDown className="size-3" /> Would bounce
                </>
              )}
            </span>
          </div>

          <p className="mt-1.5 font-serif text-base leading-snug text-white">
            &ldquo;{response.headline}&rdquo;
          </p>

          {firstQuote && !open && (
            <p className="mt-2 line-clamp-2 text-sm text-white/60 leading-relaxed">
              {firstQuote}
            </p>
          )}

          {metaLinked && (
            <p className="mt-2 text-xs text-white/45 leading-relaxed">
              This is the audience the Meta Ads targets above were calibrated
              for.
            </p>
          )}

          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-signal-300 transition-colors hover:text-signal-200"
          >
            {open ? "Hide reaction" : "See full reaction"}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4">
          <PersonaResponse response={response} />
        </div>
      )}
    </Card>
  );
}
