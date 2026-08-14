"use client";

import { Check, Circle } from "lucide-react";
import { SiteCard } from "./site-card";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { PlaybookStatus } from "@/app/actions/saved-sites";
import type { WinningSiteCard } from "@/app/actions/search";

/**
 * Playbook wrapper (FASE B). Wraps SiteCard and adds a status control below it,
 * so SiteCard itself stays untouched. `status`/`onToggle` are controlled by the
 * parent (LibraryView) so the progress bar can move optimistically.
 */
export function PlaybookCard({
  site,
  index = 0,
  status,
  onToggle,
  pending = false,
}: {
  site: WinningSiteCard;
  index?: number;
  status: PlaybookStatus;
  onToggle: () => void;
  pending?: boolean;
}) {
  const { t } = useT();
  const applied = status === "applied";

  return (
    <div className="space-y-2">
      <SiteCard site={site} index={index} canSave initialSaved />
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={applied}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60",
          applied
            ? "border-signal-400/30 bg-signal-600/15 text-signal-200 hover:bg-signal-600/25"
            : "border-white/[0.08] text-white/60 hover:border-white/20 hover:text-white",
        )}
      >
        {applied ? (
          <Check className="size-3.5" />
        ) : (
          <Circle className="size-3.5" />
        )}
        {applied ? t("library.playbook.applied") : t("library.playbook.markApplied")}
      </button>
    </div>
  );
}
