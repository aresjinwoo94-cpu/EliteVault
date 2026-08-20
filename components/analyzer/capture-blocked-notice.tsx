"use client";

import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useT } from "@/components/i18n/locale-provider";

/**
 * WP-A — shown INSTEAD of the report body when the audit's screenshot turned
 * out to be an anti-bot verification screen rather than the store.
 *
 * The failure this replaces: a Cloudflare interstitial captures perfectly —
 * normal file size, cleanly rendered — so every existing guard waved it through
 * and the model wrote a confident CRO audit of a security page. On
 * brilliantearth.com that surfaced as findings like "Cloudflare bot
 * verification blocks visitors instantly", presented to the owner as a
 * discovery about their store.
 *
 * So this card's job is to be honest about a non-result rather than dress it up
 * as an audit. It deliberately offers no score, no fixes and no annotations —
 * there is nothing truthful to put in them.
 *
 * NOTE for the PR: the brief suggested pointing users at a manual screenshot
 * upload here. The analyzer has NO uploader UI today — `createAnalysis` accepts
 * a `screenshotUrl`, but nothing in components/analyzer/ produces one — so
 * offering that would send people to a flow that doesn't exist. The actions
 * below are the ones that actually work today.
 */
export function CaptureBlockedNotice({
  url,
  vendor,
  reason,
}: {
  url: string | null;
  /** e.g. "Cloudflare" — from discovery's pre-check, when identifiable. */
  vendor?: string | null;
  /** What the model reported seeing, in its own words. */
  reason?: string | null;
}) {
  const { t } = useT();

  const domain = (() => {
    if (!url) return t("report.blockedThisSite");
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();

  // Name the vendor only when discovery actually identified one. Claiming
  // "protected by Cloudflare" from a layer-2-only detection would be a guess
  // presented as a fact, in a card whose entire purpose is not guessing.
  const body = (vendor ? t("report.blockedBodyVendor") : t("report.blockedBody"))
    .replace("{domain}", domain)
    .replace("{vendor}", vendor ?? "");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="relative overflow-hidden border-champagne-400/25 bg-champagne-400/[0.03] p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-champagne-400/10 blur-3xl" />
        <div className="relative flex flex-col items-start gap-4 md:flex-row">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-champagne-400/15 ring-1 ring-champagne-400/30">
            <ShieldAlert className="size-5 text-champagne-300" />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-2xl tracking-tight">
              {t("report.blockedTitle")}
            </h2>
            <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-white/65">
              {body}
            </p>
            {reason && (
              <p className="mt-2 text-[12px] text-white/40">
                {/* The model's own words, so the message is specific rather
                    than a generic "something went wrong". */}
                {reason}
              </p>
            )}
            <p className="mt-5 text-[10.5px] uppercase tracking-[0.18em] text-white/40">
              {t("report.blockedWhat")}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-white/70">
              <li className="flex gap-2">
                <span className="text-champagne-300">·</span>
                {t("report.blockedRetry")}
              </li>
              <li className="flex gap-2">
                <span className="text-champagne-300">·</span>
                {t("report.blockedAllowlist")}
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
