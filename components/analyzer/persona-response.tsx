"use client";

import { motion } from "framer-motion";
import { Quote, ThumbsDown, ThumbsUp } from "lucide-react";
import { Card } from "@/components/ui/card";

interface PersonaResponse {
  headline: string;
  quotes: string[];
  would_buy: boolean;
  reasons: string[];
}

export function PersonaResponse({ response }: { response: PersonaResponse }) {
  return (
    <Card className="p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Buyer-persona response</h3>
        <span
          className={
            response.would_buy
              ? "inline-flex items-center gap-1 text-xs text-success"
              : "inline-flex items-center gap-1 text-xs text-destructive"
          }
        >
          {response.would_buy ? (
            <>
              <ThumbsUp className="size-3" />
              Would buy
            </>
          ) : (
            <>
              <ThumbsDown className="size-3" />
              Would bounce
            </>
          )}
        </span>
      </div>

      <p className="mt-4 font-serif italic text-xl leading-snug text-white">
        "{response.headline}"
      </p>

      <div className="mt-5 space-y-2.5">
        {response.quotes.map((q, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className="flex gap-2.5"
          >
            <Quote className="size-3 mt-1 shrink-0 text-violet-400" />
            <p className="text-sm text-white/70 leading-relaxed">{q}</p>
          </motion.div>
        ))}
      </div>

      {response.reasons.length > 0 && (
        <div className="mt-5 pt-4 border-t border-white/[0.05]">
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
            Why
          </p>
          <ul className="space-y-1.5">
            {response.reasons.map((r, i) => (
              <li
                key={i}
                className="text-xs text-white/55 flex gap-2 leading-relaxed"
              >
                <span className="text-white/30">·</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
