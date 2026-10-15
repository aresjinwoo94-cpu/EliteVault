import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { getUserResult } from "@/lib/supabase/server";
import { getLocale, getT } from "@/lib/i18n/server";
import { reportUnlockEnabledFor } from "@/lib/flags";
import { checkUnlockEligibility } from "@/lib/unlocks/guard";
import { createReportUnlockSession } from "@/lib/stripe/report-unlock-session";
import { EmbeddedUnlockCheckoutForm } from "@/components/billing/embedded-checkout";

export const metadata = { title: "Unlock report" };
export const dynamic = "force-dynamic";

/**
 * One-time report unlock checkout (WP-3, brief oct-2026 §5.2). Separate from /app/checkout (plans), which is
 * untouched. Every guard runs on the server; with REPORT_UNLOCK off the page does not exist (404).
 * It shows NO price of its own: the embedded Stripe form shows the (localized) amount — a duplicated price
 * next to it is what the Sep 2026 checkout fix removed.
 */
export default async function UnlockPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const [
    {
      data: { user },
    },
    locale,
    { t },
  ] = await Promise.all([getUserResult(), getLocale(), getT()]);
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/app/unlock/${analysisId}`)}`);
  // 404 unless the flag is on for THIS viewer (global flag, or the production test list).
  if (!reportUnlockEnabledFor(user.email)) notFound();

  const eligibility = await checkUnlockEligibility(analysisId, user.id);
  if (eligibility.kind === "not_found") notFound();
  if (eligibility.kind !== "ok") redirect(`/app/analyzer/${analysisId}`);

  // Started at request time and unwrapped under Suspense in the client (same pattern as /app/checkout).
  // createReportUnlockSession never rejects.
  const sessionPromise = createReportUnlockSession({
    userId: user.id,
    userEmail: user.email ?? null,
    analysisId,
    domain: eligibility.domain,
    locale,
  });

  const items = ["i1", "i2", "i3", "i4", "i5"] as const;
  return (
    <div className="min-h-screen bg-obsidian-950">
      <link rel="preload" as="script" href="https://js.stripe.com/dahlia/stripe.js" />
      <link rel="preconnect" href="https://js.stripe.com" crossOrigin="" />
      <link rel="preconnect" href="https://api.stripe.com" crossOrigin="" />
      <header className="border-b border-white/[0.04] bg-obsidian-900/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href={`/app/analyzer/${analysisId}`}
            className="inline-flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            {t("unlock.backToReport")}
          </Link>
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/30">
            <Lock className="size-3" />
            {t("unlock.secure")}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6 md:py-14">
        <div className="grid items-start gap-8 lg:grid-cols-[5fr_7fr]">
          {/* On a phone the form comes first, the summary after it. */}
          <div className="order-2 space-y-6 lg:order-1">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/40">{t("unlock.eyebrow")}</p>
              <h1 className="mt-2 font-serif text-3xl leading-[1.1] tracking-tight md:text-4xl">{eligibility.domain}</h1>
              <p className="mt-3 text-sm text-white/55">{t("unlock.oneTime")}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-5">
              <p className="text-sm font-medium text-white">{t("unlock.includesTitle")}</p>
              <ul className="mt-3 space-y-2.5">
                {items.map((k) => (
                  <li key={k} className="flex items-start gap-2.5 text-sm text-white/70">
                    <Check className="mt-0.5 size-4 shrink-0 text-signal-300" />
                    {t(`unlock.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-white/40">{t("unlock.proNote")}</p>
          </div>
          <div className="order-1 lg:order-2">
            <EmbeddedUnlockCheckoutForm analysisId={analysisId} sessionPromise={sessionPromise} />
          </div>
        </div>
      </div>
    </div>
  );
}
