import { AppScope } from "@/components/i18n/app-scope";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AnnotationsOverlay } from "@/components/analyzer/annotations-overlay";
import { ReportHeroV2 } from "@/components/analyzer/report-hero-v2";
import { ShareCtaLink, ShareViewTracker } from "@/components/share/share-analytics";
import { ShareAuditBox } from "@/components/share/share-audit-box";
import { ShareFreshness, ShareLockedViews, ShareNote } from "@/components/share/share-blocks";
import { buildShareResult, shareMeta, type SharedAuditRow } from "@/lib/analyzer/share-v2";
import {
  SHARE_NOTE_AUTHOR,
  auditedOnLabel,
  isShareIndexable,
  isStaleAudit,
  shareRobots,
} from "@/lib/analyzer/share-policy";
import type { Annotation } from "@/lib/supabase/types";
import { getT } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/lookup";
import { reportUnlockEnabled } from "@/lib/flags";

/**
 * Public audit page (/s/[slug]) — brief 2026-10 §2.
 *
 * It does two jobs: convince the owner of THAT store (a personal note on top, claim flow in PR-3) and
 * convince any other visitor to run EliteVault on their own store (embedded box = the existing anonymous flow).
 *
 * Rules enforced here and in scripts/tests/share-page.test.ts:
 *   • No score anywhere (UI, metadata, JSON-LD, OG image): the verdict in words + the estimated $ potential band.
 *   • No "free" / "no card" in any copy.
 *   • Locked views name what else exists (counts only); the paid content never reaches this page (the RPC
 *     withholds top_fixes titles and the persona; the blocks only receive counts).
 *   • Indexing: unlisted (noindex, out of the sitemap) unless the owner flagged the audit — see share-policy.ts.
 */

// Slug-addressed, public, logged-out friendly — never static.
export const dynamic = "force-dynamic";

type SharedAudit = SharedAuditRow;

async function loadSharedAudit(slug: string): Promise<SharedAudit | null> {
  const supabase = await createSupabaseServerClient();
  // SECURITY DEFINER RPC — returns only the public diagnosis fields.
  // Cast: the RPC isn't in the hand-written Database type (same known
  // types gap noted in next.config.mjs), so .rpc() args type as `never`.
  const { data, error } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase as any
  ).rpc("get_shared_audit", { p_slug: slug });
  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return {
    url: d.url ?? null,
    score: typeof d.score === "number" ? d.score : Number(d.score) || null,
    summary: d.summary ?? null,
    screenshot_url: d.screenshot_url ?? null,
    category_scores: d.category_scores ?? null,
    annotations: stripPaidFix(d.annotations),
    created_at: d.created_at ?? null,
    // report-v2 parity (undefined on old audits / pre-migration RPC):
    ad_readiness_verdict: d.ad_readiness_verdict ?? null,
    blocker_count: d.blocker_count ?? null,
    fix_count: d.fix_count ?? null,
    potential_why: Array.isArray(d.potential_why) ? d.potential_why : null,
    capture_blocked:
      typeof d.capture_blocked === "boolean" ? d.capture_blocked : null,
    // v3 (migration 0045): absent before it is applied → no note, never indexable.
    share_note: typeof d.share_note === "string" && d.share_note.trim() ? d.share_note.trim() : null,
    share_indexable: d.share_indexable === true,
  };
}

/**
 * The public page shows the DIAGNOSIS (what is wrong, where) and never the CURE: the `fix` text of every
 * annotation is paid content (the app blanks it for fixes 2+ and for non-unlocked viewers). The RPC strips it too
 * (migration 0045); doing it here as well keeps the page safe before that migration is applied.
 */
function stripPaidFix(raw: unknown): Annotation[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((a) => ({ ...(a as Annotation), fix: "", fix_locked: true }) as Annotation);
}

function domainOf(url: string | null): string {
  if (!url) return "this store";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "this store";
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const audit = await loadSharedAudit(slug);
  if (!audit) {
    // Not found: keep it out of the index too.
    return { title: "Audit not found — EliteVault", robots: { index: false, follow: false } };
  }
  const domain = domainOf(audit.url);
  const { title, description } = shareMeta(domain, buildShareResult(audit));
  const desc = (audit.summary?.slice(0, 160) ?? description).slice(0, 200);
  return {
    title,
    description: desc,
    // Unlisted by default; only an owner-flagged, complete v2 audit may be indexed (share-policy.ts).
    robots: shareRobots(audit),
    alternates: { canonical: `/s/${slug}` },
    openGraph: { title, description: desc, type: "article" },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

/** Shared top bar. The CTA jumps to the "run the same audit" box on this page. */
async function ShareHeader({ slug }: { slug: string }) {
  const { t } = await getT();
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-obsidian-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 md:px-6">
        <Link href="/">
          <Logo size={24} />
        </Link>
        <ShareCtaLink
          slug={slug}
          position="header"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-signal-500 px-3.5 text-sm font-medium text-obsidian-950 transition-colors hover:bg-signal-400"
        >
          {t("sharedPage.headerCta")}
          <ArrowRight className="size-4" />
        </ShareCtaLink>
      </div>
    </header>
  );
}

async function SharedAuditPageInner({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { t } = await getT();
  const { slug } = await params;
  const audit = await loadSharedAudit(slug);
  if (!audit) notFound();

  const domain = domainOf(audit.url);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

  const result = buildShareResult(audit);
  const { title } = shareMeta(domain, result);
  const indexable = isShareIndexable(audit);
  const stale = isStaleAudit(audit);
  const auditedOn = auditedOnLabel(audit.created_at);
  const fixCount = Math.max(0, Math.round(Number(audit.fix_count ?? 0)) || 0);

  // JSON-LD only on a page search engines may index. No score, no "/100".
  const jsonLd = indexable
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description:
          audit.summary?.slice(0, 200) ??
          `An annotated conversion audit of ${domain}.`,
        url: `${baseUrl}/s/${slug}`,
        about: { "@type": "Thing", name: domain },
        author: { "@type": "Organization", name: "EliteVault" },
        publisher: {
          "@type": "Organization",
          name: "EliteVault",
          logo: { "@type": "ImageObject", url: `${baseUrl}/icon.svg` },
        },
      }
    : null;

  return (
    <div className="min-h-screen bg-obsidian-950 text-white">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\u003c") }}
        />
      )}
      <ShareViewTracker slug={slug} mode="visitor" stale={stale} indexable={indexable} />
      <ShareHeader slug={slug} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 pb-24 md:px-6 md:py-12">
        <div className="flex justify-center">
          <Badge variant="gold">
            <Sparkles className="size-3" />
            {t("sharedPage.public")}
          </Badge>
        </div>

        {audit.share_note && (
          <ShareNote t={t} note={audit.share_note} preparedBy={SHARE_NOTE_AUTHOR} domain={domain} />
        )}

        <ShareFreshness t={t} slug={slug} auditedOn={auditedOn} stale={stale} />

        {/* The SAME hero as the report: verdict in words + the estimated $ potential + why. No score. */}
        <ReportHeroV2 result={result} domain={domain} shareMode shareSlug={slug} />

        {/* Annotated screenshot — the shareable "wow", full width. */}
        {audit.annotations && audit.annotations.length > 0 && (
          <AnnotationsOverlay
            imageUrl={audit.screenshot_url ?? ""}
            annotations={audit.annotations as Annotation[]}
            altLabel={fill(t("sharedPage.shotAlt"), { domain })}
          />
        )}

        {/* For any other visitor: the existing anonymous flow, embedded (same quota and anti-bot rules). */}
        <Card
          id="run-audit"
          className="scroll-mt-24 border-signal-400/25 bg-gradient-to-br from-signal-500/[0.06] to-transparent p-6 md:p-8"
        >
          <p className="text-[10.5px] uppercase tracking-[0.2em] text-white/40">
            {fill(t("sharedPage.runOwnHook"), { domain })}
          </p>
          <h2 className="mt-2 font-display text-2xl tracking-tight md:text-3xl">
            {t("sharedPage.runOwn")}
          </h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-white/60">
            {t("sharedPage.runOwnBody")}
          </p>
          <div className="mt-5">
            <ShareAuditBox
              slug={slug}
              label={t("sharedPage.boxButton")}
              caption={t("sharedPage.boxCaption")}
            />
          </div>
        </Card>

        <ShareLockedViews t={t} slug={slug} fixCount={fixCount} unlockOn={reportUnlockEnabled()} />

        <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-white/35">
          <ShieldCheck className="size-3" />
          {t("sharedPage.estimates")}
        </p>
        <p className="pb-8 text-center text-[11px] text-white/30">
          {t("sharedPage.auditedWith")}{" "}
          <Link href="/" className="text-white/50 hover:text-white/80">
            EliteVault
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

/**
 * The report UI reads the `app` dictionary scope (lib/i18n/client-namespaces.ts);
 * this public route is outside app/(app)/layout.tsx, so it mounts the scope itself.
 */
export default async function SharedAuditPage(props: Parameters<typeof SharedAuditPageInner>[0]) {
  return <AppScope>{await SharedAuditPageInner(props)}</AppScope>;
}
