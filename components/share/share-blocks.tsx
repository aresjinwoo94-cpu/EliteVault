import { CalendarClock, Lock, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ShareCtaLink } from "@/components/share/share-analytics";
import { fill } from "@/lib/i18n/lookup";
import { lockedViewItems } from "@/lib/analyzer/share-locked";

/**
 * Presentational blocks of the public audit page. They take a plain `t` and primitive props — never the audit
 * result — so a locked block CANNOT leak paid content: the only inputs are counts and the viewer-facing plan copy.
 * (`share-v2` already withholds top_fixes titles and the persona from the public RPC; this keeps the UI honest too.)
 */

type T = (key: string) => string;

/** "Prepared by Ariel for <domain>" + the owner's short note. Rendered only when a note exists. */
export function ShareNote({ t, note, preparedBy, domain }: { t: T; note: string; preparedBy: string; domain: string }) {
  return (
    <Card className="border-signal-400/20 bg-signal-500/[0.04] p-5 md:p-6" data-share-block="note">
      <p className="text-[10.5px] uppercase tracking-[0.2em] text-white/40">
        {fill(t("sharedPage.preparedBy"), { name: preparedBy, domain })}
      </p>
      <p className="mt-2 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-white/75">{note}</p>
    </Card>
  );
}

/** "Audited on <date>" and, for old / pre-v2 audits, the "may have changed" banner with a fresh-audit CTA. */
export function ShareFreshness({
  t,
  slug,
  auditedOn,
  stale,
}: {
  t: T;
  slug: string;
  auditedOn: string | null;
  stale: boolean;
}) {
  return (
    <div className="space-y-3" data-share-block="freshness">
      {auditedOn && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-white/45">
          <CalendarClock className="size-3.5" />
          {fill(t("sharedPage.auditedOn"), { date: auditedOn })}
        </p>
      )}
      {stale && (
        <Card
          role="note"
          className="flex flex-col gap-3 border-champagne-400/25 bg-champagne-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/90">{t("sharedPage.staleTitle")}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
              {auditedOn
                ? fill(t("sharedPage.staleBody"), { date: auditedOn })
                : t("sharedPage.staleBodyNoDate")}
            </p>
          </div>
          <ShareCtaLink
            slug={slug}
            position="stale_banner"
            className="group inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-champagne-400/40 bg-champagne-400/[0.08] px-3.5 py-2 text-[13px] font-medium text-champagne-200 transition-colors hover:border-champagne-400/60 hover:bg-champagne-400/[0.15] sm:self-center"
          >
            <RefreshCw className="size-4" />
            {t("sharedPage.staleCta")}
          </ShareCtaLink>
        </Card>
      )}
    </div>
  );
}

/** Locked views (brief 2026-10 §2.3): names and counts only — see lib/analyzer/share-locked.ts for the rule and the plans. */
export function ShareLockedViews({ t, slug, fixCount }: { t: T; slug: string; fixCount: number }) {
  const items = lockedViewItems(t, fixCount);
  return (
    <section aria-labelledby="share-locked-h" data-share-block="locked">
      <h2 id="share-locked-h" className="font-display text-xl tracking-tight text-white md:text-2xl">
        {t("sharedPage.lockedHeading")}
      </h2>
      <p className="mt-1 text-xs text-white/40">{t("sharedPage.lockedNote")}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.position}>
            <Card className="flex h-full flex-col gap-2 p-4 md:p-5" data-locked={it.position}>
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-white/40" aria-hidden />
                <p className="text-sm font-medium leading-snug text-white/85">{it.title}</p>
              </div>
              <p className="text-[12.5px] leading-relaxed text-white/50">{it.plan}</p>
              <ShareCtaLink
                slug={slug}
                position={it.position}
                className="mt-auto pt-1 text-[13px] font-medium text-signal-300 transition-colors hover:text-signal-200"
              >
                {t("sharedPage.lockCta")}
              </ShareCtaLink>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
