import { Suspense } from "react";
import { getT } from "@/lib/i18n/server";
import { PLANS } from "@/lib/stripe/plans";
import { getInUseData } from "@/lib/marketing/site-stats";
import { readySecondaryTeasers } from "./teasers";
import { ArrowRight } from "lucide-react";
import { ToolkitController } from "./toolkit-controller";
import type { ToolAction, ToolCardData, ToolId, ToolkitLabels } from "./toolkit-types";
import { AnalyzerDiagram, LibraryDiagram, SimulatorDiagram, ToolkitDiagramStyles } from "./toolkit-diagrams";
import { ToolkitCta } from "./toolkit-cta";
import { TrustReveal } from "./trust-band-client";

/**
 * "The toolkit" — replaces the old "The Analyzer · Live Demo" section.
 * Same anchor (`id="analyzer"`): the hero's "see how it works first" link and
 * the nav (`/#analyzer`) point here.
 *
 * Its one job is to make the visitor believe EliteVault is a real, working,
 * in-use product. Three blocks:
 *   01 The toolkit — 3 clickable cards (diagram → lightbox with REAL screenshots)
 *   02 Built on    — the real stack, as plain text names (see BUILT_ON)
 *   03 In use      — live counters with thresholds + fallback (lib/marketing/in-use.ts)
 * and ONE CTA that focuses the hero's URL input.
 *
 * Reparto with TrustBand: TrustBand = why to believe the ESTIMATES; this
 * section = why to believe the PRODUCT. Don't repeat Meta Ad Library or the
 * benchmarks here.
 *
 * Plan pills are DERIVED from lib/stripe/plans.ts (never hand-written):
 *   • Analyzer  → Free includes it (`unlocksAnalyzer`), more in Pro.
 *   • Library   → Free sees `libraryFullMetricsCap` stores, Pro is uncapped (null).
 *   • Simulator → plans whose `quotas.metaRunsPerMonth !== 0` (Pro: 1, Scale: unlimited).
 *
 * BUILT_ON brand-guide notes (we show NAMES AS TEXT, no logos — none of these
 * guides explicitly covers a third-party "built on" row, so text is the safe
 * choice; the footer line below states there is no affiliation or endorsement):
 *   • Stripe   https://stripe.com/newsroom/brand-assets — wordmark only in its
 *              official colors; the "Powered by Stripe" badge is for checkout
 *              pages; other uses fall under Stripe's Marks Usage Agreement.
 *   • Supabase https://supabase.com/brand-assets — official SVGs, never modified
 *              or recolored; "built with" usage is not addressed (ask Supabase).
 *   • Vercel   https://vercel.com/geist/brands — may truthfully say you are a
 *              customer ("hosted on the Vercel platform"); requires a trademark
 *              attribution in the footer; must not imply sponsorship/endorsement.
 *   • Next.js  covered by the same Vercel brand page; write it exactly "Next.js".
 * Chosen 4th slot: Next.js (used in production; most recognizable of the
 * candidates). Never list Gemini/Anthropic here.
 */

const BUILT_ON = [
  { name: "Stripe", labelKey: "toolkit.boPayments" },
  { name: "Supabase", labelKey: "toolkit.boDatabase" },
  { name: "Vercel", labelKey: "toolkit.boHosting" },
  { name: "Next.js", labelKey: "toolkit.boFramework" },
] as const;

/** Brand name + separator for the cover spine (not translatable copy). */
const BRAND = "EliteVault";
const SEP = " · ";

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

export async function Toolkit() {
  const { t } = await getT();
  const pro = PLANS.pro.name;
  const scale = PLANS.scale.name;
  const freeStores = PLANS.free.libraryFullMetricsCap;
  const simulatorPlans = Object.values(PLANS)
    .filter((p) => p.quotas.metaRunsPerMonth !== 0)
    .map((p) => p.name);

  const readyIds = new Set(readySecondaryTeasers().map((x) => x.id));
  const teaserAction = (id: "main" | "pro" | "simulator", labelKey: string): ToolAction[] =>
    id === "main" || readyIds.has(id) ? [{ kind: "teaser", teaserId: id, label: t(labelKey) }] : [];

  const tools: ToolCardData[] = [
    {
      id: "analyzer",
      name: t("toolkit.analyzerName"),
      line: t("toolkit.analyzerLine"),
      pill: fill(t(PLANS.free.unlocksAnalyzer ? "toolkit.analyzerPill" : "toolkit.simulatorPill"), {
        pro,
        scale,
      }),
      shots: [
        { src: "/marketing/tools/analyzer-1-verdict.webp", w: 1800, h: 1910, caption: t("toolkit.aCap1") },
        { src: "/marketing/tools/analyzer-2-annotated.webp", w: 1800, h: 1464, caption: t("toolkit.aCap2") },
        { src: "/marketing/tools/analyzer-3-persona.webp", w: 1800, h: 1372, caption: t("toolkit.aCap3") },
      ],
      actions: [...teaserAction("main", "toolkit.actWatch"), ...teaserAction("pro", "toolkit.actPro")],
    },
    {
      id: "library",
      name: t("toolkit.libraryName"),
      line: t("toolkit.libraryLine"),
      pill: fill(t("toolkit.libraryPill"), { n: freeStores ?? "", pro }),
      shots: [
        { src: "/marketing/tools/library-1-grid.webp", w: 1800, h: 2280, caption: t("toolkit.lCap1") },
        { src: "/marketing/tools/library-2-teardown.webp", w: 1152, h: 1478, caption: t("toolkit.lCap2") },
      ],
      actions: [{ kind: "link", href: "/winning-shopify-stores", label: t("toolkit.actLibrary") }],
    },
    {
      id: "simulator",
      name: t("toolkit.simulatorName"),
      line: t("toolkit.simulatorLine"),
      pill: simulatorPlans.join(" · "),
      shots: [
        { src: "/marketing/tools/simulator-1-scenarios.webp", w: 1800, h: 1900, caption: t("toolkit.sCap1") },
        { src: "/marketing/tools/simulator-2-optimizer.webp", w: 1800, h: 1812, caption: t("toolkit.sCap2") },
      ],
      actions: [
        ...teaserAction("simulator", "toolkit.actSimulator"),
        { kind: "note", text: fill(t("toolkit.simNote"), { scale }) },
      ],
    },
  ];

  const labels = {
    seeIt: t("toolkit.seeIt"),
    kicker: t("toolkit.kicker"),
    lbPrev: t("toolkit.lbPrev"),
    lbNext: t("toolkit.lbNext"),
    lbCounter: t("toolkit.lbCounter"),
    dPotential: t("toolkit.dPotential"),
    dYourStore: t("toolkit.dYourStore"),
    dTop: t("toolkit.dTop"),
    dBreakEven: t("toolkit.dBreakEven"),
    dDays: t("toolkit.dDays"),
  };

  return (
    <section
      id="analyzer"
      aria-label={t("toolkit.eyebrow")}
      className="relative mt-12 scroll-mt-20 md:mt-16"
    >
      <ToolkitDiagramStyles />
      <div className="container max-w-[1280px]">
        {/* 01 — the toolkit */}
        <TrustReveal>
          <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            {t("toolkit.eyebrow")}
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl text-balance text-center font-serif text-2xl tracking-tight md:text-4xl">
            {t("toolkit.heading")}
          </h2>
        </TrustReveal>
        <div className="mt-6 md:mt-8">
          <ToolGrid tools={tools} labels={labels} />
          <ToolkitController tools={tools} labels={labels} />
        </div>

        {/* 02 — built on */}
        <TrustReveal className="mt-8 border-t border-white/[0.04] pt-6 md:mt-10 md:pt-8">
          <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            {t("toolkit.builtOn")}
          </p>
          <ul className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4 md:gap-x-6">
            {BUILT_ON.map((b) => (
              <li key={b.name} className="text-center">
                <p className="text-sm font-semibold tracking-tight text-white/60 transition-colors hover:text-white/90 md:text-lg">
                  {b.name}
                </p>
                <p className="mt-0.5 font-mono text-[10px] leading-tight text-white/35 md:text-[11px]">{t(b.labelKey)}</p>
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[11px] leading-relaxed text-white/30">
            {t("toolkit.trademarks")}
          </p>
        </TrustReveal>

        {/* 03 — in use. Streams in: the counters' queries (cached 6 h, 1.5 s timeout) must never hold up
            the first byte of the landing. The fallback only reserves the space. */}
        <Suspense fallback={<div aria-hidden className="mt-8 h-28 md:mt-10 md:h-32" />}>
          <InUseBlock t={t} />
        </Suspense>

        {/* CTA — a single button */}
        <div className="mt-8 flex justify-center md:mt-10">
          <ToolkitCta label={t("toolkit.cta")} />
        </div>
      </div>
    </section>
  );
}

/** Block 03 — "In use" (hidden entirely if fewer than 2 counters pass their threshold). */
async function InUseBlock({ t }: { t: (path: string) => string }) {
  const inUse = await getInUseData();
  if (inUse.counters.length === 0) return null;
  const counterLabel = { audits: "toolkit.cAudits", stores: "toolkit.cStores", niches: "toolkit.cNiches" } as const;
  return (
          <TrustReveal className="mt-8 border-t border-white/[0.04] pt-6 md:mt-10 md:pt-8">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
          {t("toolkit.inUse")}
        </p>
        <ul
          className={`mx-auto mt-4 grid max-w-3xl gap-4 ${
            inUse.counters.length >= 3 ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          {inUse.counters.map((c) => (
            <li key={c.key} className="text-center">
              <p className="font-mono text-2xl tabular-nums text-white md:text-4xl">
                {c.value.toLocaleString("en-US")}
                {c.key === "niches" ? "" : "+"}
              </p>
              <p className="mt-1 text-xs text-white/50 md:text-sm">{t(counterLabel[c.key])}</p>
            </li>
          ))}
        </ul>
        {inUse.aiVisits !== null && (
          <p className="mt-4 text-center text-xs text-white/40">
            {fill(t("toolkit.aiLine"), { n: inUse.aiVisits.toLocaleString("en-US") })}
          </p>
        )}
      </TrustReveal>
  );
}

function Diagram({ id, labels }: { id: ToolId; labels: ToolkitLabels }) {
  if (id === "analyzer") return <AnalyzerDiagram potentialLabel={labels.dPotential} />;
  if (id === "library") return <LibraryDiagram youLabel={labels.dYourStore} topLabel={labels.dTop} />;
  return <SimulatorDiagram breakEvenLabel={labels.dBreakEven} daysLabel={labels.dDays} />;
}

/**
 * The 3 tools are presented as premium "product boxes": a cover with a visible
 * spine, in EliteVault's own language (obsidian + teal, hairlines, soft depth).
 * They are SERVER-rendered HTML (no hydration cost on the landing's critical
 * path): real <button>s that ToolkitController wires up by event delegation and
 * opens the lightbox for. `data-in` arms the CSS-only art animation once the card
 * scrolls into view. The 3D pose is pure CSS (see toolkit-diagrams.tsx).
 */
function ToolGrid({ tools, labels }: { tools: ToolCardData[]; labels: ToolkitLabels }) {
  return (
    <ul className="grid grid-cols-1 gap-7 md:gap-8 lg:grid-cols-3 lg:gap-10">
      {tools.map((tool, i) => (
        <li key={tool.id}>
          <button
            type="button"
            data-tool={tool.id}
            data-in="false"
            aria-haspopup="dialog"
            className="tk-card group block w-full cursor-pointer text-left"
          >
            <span className="tk-stage block">
              <span className="tk-box block">
                <span className="tk-spine" aria-hidden>
                  <span>{[BRAND, tool.name].join(SEP)}</span>
                </span>
                <span className="tk-front flex min-h-[300px] flex-col md:min-h-[452px]">
                  <span className="relative z-[1] flex items-start justify-between px-5 pt-4 md:px-6 md:pt-5">
                    <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-300/90">
                      {labels.kicker}
                    </span>
                    <span className="tk-num font-serif text-4xl md:text-5xl" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </span>
                  <span className="relative z-[1] -mt-2 block h-[140px] px-3 md:h-[200px] md:px-4">
                    <Diagram id={tool.id} labels={labels} />
                  </span>
                  <span className="relative z-[1] mt-auto block px-5 pb-4 md:px-6 md:pb-5">
                    <span className="block font-serif text-xl tracking-tight text-white md:text-2xl">{tool.name}</span>
                    <span className="mt-1.5 block text-[13px] leading-relaxed text-white/60 md:min-h-[2.8rem] md:text-sm">{tool.line}</span>
                    <span className="mt-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/[0.08] pt-3">
                      <span className="rounded-full border border-signal-400/30 bg-signal-500/10 px-2.5 py-0.5 font-mono text-[11px] text-signal-200">
                        {tool.pill}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-signal-300 transition-colors group-hover:text-signal-200">
                        {labels.seeIt}
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </span>
                  </span>
                </span>
                <span className="tk-floor" aria-hidden />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
