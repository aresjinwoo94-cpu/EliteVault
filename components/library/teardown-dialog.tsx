"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Layers, Star } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleSavedSite } from "@/app/actions/saved-sites";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { WinningSiteCard } from "@/app/actions/search";
import type { AuditDimension } from "@/lib/supabase/types";

/**
 * Teardown ("Cómo convierte esta tienda") — an annotated breakdown of a
 * winning store's conversion elements, each tagged with the SAME dimension
 * key the Analyzer uses (AnalysisResult.category_scores). Content is
 * precomputed jsonb (never generated per request), so this renders with zero
 * runtime AI cost. Only mounted by SiteCard when `site.teardown` exists.
 */
export function TeardownDialog({
  site,
  initialSaved = false,
}: {
  site: WinningSiteCard;
  initialSaved?: boolean;
}) {
  const { t } = useT();
  const teardown = site.teardown;
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  // Defensive: SiteCard already gates on this, but keep the component honest.
  if (!teardown) return null;

  function saveToPlaybook() {
    const prev = saved;
    setSaved(!prev);
    startTransition(async () => {
      const res = await toggleSavedSite(site.id);
      if (!res.ok) {
        setSaved(prev);
        toast.error(res.error);
        return;
      }
      if (res.saved && !prev) toast.success(t("library.teardown.saved"));
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("library.teardown.cta")}
          title={t("library.teardown.cta")}
          onClick={(e) => e.stopPropagation()}
          className="size-7 grid place-items-center rounded-md text-white/40 hover:text-champagne-200 hover:bg-champagne-400/10 transition-colors"
        >
          <Layers className="size-3.5" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="ai">
              <Layers className="size-3" />
              {t("library.teardown.cta")}
            </Badge>
          </div>
          <DialogTitle className="mt-1">{site.title}</DialogTitle>
          <p className="text-xs text-white/40">{site.domain}</p>
          <p className="mt-2 font-serif text-lg leading-snug text-white/85">
            {teardown.summary}
          </p>
        </DialogHeader>

        <div className="space-y-2.5">
          {teardown.elements.map((el, i) => (
            <motion.div
              key={`${el.element}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(i * 0.05, 0.3),
                duration: 0.35,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="rounded-xl border border-white/[0.06] bg-card/40 p-3.5"
            >
              <div className="flex items-center gap-2">
                <Badge variant="gold">
                  {t(`library.dimension.${el.dimension as AuditDimension}`)}
                </Badge>
                <span className="font-medium text-white">{el.element}</span>
              </div>
              <p className="mt-2 text-sm text-white/60">{el.observation}</p>
              <p className="mt-2 rounded-lg border border-signal-400/15 bg-signal-600/[0.06] px-3 py-2 text-sm text-white/80">
                <span className="font-mono text-[10px] uppercase tracking-wide text-signal-300">
                  {t("library.teardown.applyLabel")}
                </span>{" "}
                {el.takeaway}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="ai"
            onClick={saveToPlaybook}
            disabled={isPending || saved}
          >
            <Star className={cn("size-4", saved && "fill-current")} />
            {saved ? t("library.teardown.savedLabel") : t("library.teardown.saveToPlaybook")}
          </Button>
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
          >
            {site.domain}
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
