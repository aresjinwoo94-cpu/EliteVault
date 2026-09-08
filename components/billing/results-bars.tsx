import { getT } from "@/lib/i18n/server";

/**
 * Two survey-result bars on the checkout (brief §3).
 *
 * Same visual language as PotentialDiagram on the landing: a 1.5px rail with a
 * champagne fill, mono tabular numbers. Same honesty rule too — these are
 * SELF-REPORTED survey answers, so the caption always says so. Never present
 * them as a guarantee.
 */

/** Owner-editable: the survey figures. */
const ROAS_PCT = 87.2;
const CPP_PCT = 79.5;
/** Respondent count. 0 → the caption drops the "(n = …)" fragment entirely
 *  but KEEPS the "estimate, not a guarantee" disclaimer. */
const SURVEY_N = 0;

function Bar({ pct, label }: { pct: number; label: string }) {
  // Clamp so a mis-typed constant can never overflow the rail.
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="flex items-center gap-3"
      role="img"
      aria-label={`${pct}% ${label}`}
    >
      <span className="w-16 shrink-0 font-mono text-xl tabular-nums text-white">
        {pct}%
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-snug text-white/60">{label}</p>
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-champagne-400/70"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export async function ResultsBars() {
  const { t } = await getT();
  const caption =
    SURVEY_N > 0
      ? t("checkout.resultsCaption").replace("{n}", String(SURVEY_N))
      : t("checkout.resultsCaptionNoN");

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-5">
      <p className="text-[11px] uppercase tracking-widest text-white/40">
        {t("checkout.resultsHeading")}
      </p>
      <div className="mt-4 space-y-4">
        <Bar pct={ROAS_PCT} label={t("checkout.resultsRoas")} />
        <Bar pct={CPP_PCT} label={t("checkout.resultsCpp")} />
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-white/40">{caption}</p>
    </div>
  );
}
