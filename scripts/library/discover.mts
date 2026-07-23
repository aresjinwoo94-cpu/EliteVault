/**
 * Library discovery job (FASE A.2) — Meta first, AI seeds second.
 *
 *   npm run library:discover -- skincare
 *   npm run library:discover -- skincare -n 25
 *   npm run library:discover -- --all-niches -n 15
 *   npm run library:discover -- skincare --dry
 *
 * Source order, exactly as the plan requires:
 *   1. META AD LIBRARY (free, official). Advertisers running the most active
 *      ads for a niche keyword ARE the winners of that niche — it's a
 *      discovery source and a momentum source in one. Needs a free developer
 *      token; when it's absent we say so and fall through.
 *   2. AI-CURATED SEEDS via the existing library-discovery-agent — the
 *      bootstrap path already in the repo. Reused, not rewritten.
 *   3. No paid sources. Ever.
 *
 * Everything discovered lands as `status = 'draft'`. NOTHING here publishes:
 * that's `npm run library:verify`'s job, after it has probed the site and run
 * the publication gate. So a bad candidate can never reach a user's report.
 *
 * Idempotent: rows are upserted on `url`, and `domain_key` (unique) blocks the
 * same store arriving twice under a different URL spelling.
 */
import {
  serviceClient,
  arg,
  hasFlag,
  sleep,
  requireExpansionColumns,
  exitWith,
} from "./_shared.mts";
import { normalizeDomain, canonicalUrl, faviconUrl } from "../../lib/library/domain.ts";
import { discoverAdvertisers, metaApiConfigured } from "../../lib/library/meta-ad-library.ts";
import { NICHE_LABELS } from "../../lib/library/niches.ts";

interface Candidate {
  url: string;
  domain: string;
  title: string;
  description: string | null;
  /** Canonical Library slug — always one of NICHE_LABELS, never the agent's free text. */
  niche: string;
  /** The agent's finer-grained label (e.g. "Baby Apparel"), kept for reference. */
  subNiche: string | null;
  tags: string[];
  metrics: Record<string, number> | null;
  activeAds: number | null;
  source: string;
}

const svc = serviceClient();
await requireExpansionColumns(svc);

const dry = hasFlag("--dry");
const desired = Number(arg("-n", "15"));
const allNiches = hasFlag("--all-niches");
const positional = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : null;

const niches = allNiches ? Object.keys(NICHE_LABELS) : positional ? [positional] : [];
if (niches.length === 0) {
  console.error(
    "usage: npm run library:discover -- <niche> [-n 15] [--dry]\n" +
      "       npm run library:discover -- --all-niches\n" +
      `niches: ${Object.keys(NICHE_LABELS).join(", ")}`,
  );
  await exitWith(1);
}

/** Domains already in the Library — never re-discover them. */
async function existingDomains(): Promise<Set<string>> {
  const { data } = await svc.from("winning_sites").select("domain, domain_key");
  const set = new Set<string>();
  for (const row of (data ?? []) as { domain: string; domain_key: string | null }[]) {
    const key = row.domain_key ?? normalizeDomain(row.domain);
    if (key) set.add(key);
  }
  return set;
}

/** 1 — Meta Ad Library: who is actively advertising in this niche today. */
async function fromMeta(niche: string, known: Set<string>): Promise<Candidate[]> {
  if (!metaApiConfigured()) return [];
  const label = NICHE_LABELS[niche]?.label ?? niche;
  const advertisers = await discoverAdvertisers(label);
  const out: Candidate[] = [];
  for (const a of advertisers) {
    const domain = normalizeDomain(a.domain);
    const url = canonicalUrl(a.domain);
    if (!domain || !url || known.has(domain)) continue;
    known.add(domain);
    out.push({
      url,
      domain,
      title: a.name || domain,
      description: null,
      niche,
      subNiche: null,
      tags: [niche],
      metrics: null,
      activeAds: a.ads,
      source: "meta_ad_library",
    });
    if (out.length >= desired) break;
  }
  return out;
}

/** 2 — the existing AI discovery agent (bootstrap seeds). */
async function fromAgent(
  niche: string,
  known: Set<string>,
  need: number,
): Promise<Candidate[]> {
  if (need <= 0) return [];
  const { runLibraryDiscoveryAgent } = await import(
    "../../ai/agents/library-discovery-agent"
  );
  const result = await runLibraryDiscoveryAgent({
    niche,
    exclude: [...known].slice(0, 40),
    desiredCount: Math.min(20, need),
  });
  const out: Candidate[] = [];
  for (const c of result.candidates) {
    const domain = normalizeDomain(c.domain || c.url);
    const url = canonicalUrl(c.url || c.domain);
    if (!domain || !url || known.has(domain)) continue;
    known.add(domain);
    out.push({
      url,
      domain,
      title: c.title,
      description: c.description,
      // Pin the niche to the canonical slug we asked the agent for. The agent
      // sometimes answers with a finer label ("Baby Apparel") instead of the
      // slug; trusting it drops the store outside the taxonomy and out of the
      // niche pages + analyzer module. Its label is preserved in sub_niche.
      niche,
      subNiche:
        typeof c.niche === "string" && c.niche.trim() && c.niche !== niche
          ? c.niche.trim()
          : null,
      tags: c.tags ?? [niche],
      metrics: c.metrics,
      activeAds: c.ad_signals?.active_ads ?? null,
      source: "discovery_agent",
    });
    if (out.length >= need) break;
  }
  if (result.caveats?.length) {
    result.caveats.forEach((c: string) => console.log(`    · caveat: ${c}`));
  }
  return out;
}

const known = await existingDomains();
console.log(
  `\nLibrary holds ${known.size} store(s). Discovering up to ${desired} per niche` +
    `${dry ? " (dry run — no writes)" : ""}.\n` +
    (metaApiConfigured()
      ? "Source order: Meta Ad Library → discovery agent.\n"
      : "ℹ META_AD_LIBRARY_TOKEN not set — falling back to the discovery agent only.\n"),
);

let inserted = 0;
let failed = 0;

for (const niche of niches) {
  console.log(`\n▸ ${NICHE_LABELS[niche]?.label ?? niche}`);

  let candidates: Candidate[] = [];
  try {
    candidates = await fromMeta(niche, known);
    if (candidates.length) console.log(`  meta: ${candidates.length} advertiser(s)`);
  } catch (err) {
    console.log(`  meta: skipped (${(err as Error).message})`);
  }

  try {
    const extra = await fromAgent(niche, known, desired - candidates.length);
    if (extra.length) console.log(`  agent: ${extra.length} candidate(s)`);
    candidates = candidates.concat(extra);
  } catch (err) {
    console.log(`  agent: skipped (${(err as Error).message})`);
  }

  if (candidates.length === 0) {
    console.log("  (nothing new)");
    continue;
  }

  for (const c of candidates) {
    // Everything enters as DRAFT — unverified data never reaches a user.
    const row = {
      url: c.url,
      domain: c.domain,
      domain_key: c.domain,
      title: c.title,
      description: c.description,
      niche: c.niche,
      sub_niche: c.subNiche,
      tags: c.tags,
      metrics: c.metrics ?? {},
      // Legacy NOT NULL column: the verify/thumbs jobs replace this with a real
      // capture. An empty string would render a broken tile, so we point at the
      // same mshots placeholder the existing seeds use.
      thumbnail_url: `https://s.wordpress.com/mshots/v1/${encodeURIComponent(c.url)}?w=800&h=560`,
      favicon_url: faviconUrl(c.domain),
      active_ads_count: c.activeAds,
      ads_last_checked_at: c.activeAds !== null ? new Date().toISOString() : null,
      added_by_ai: c.source === "discovery_agent",
      source: c.source,
      status: "draft",
      is_live: true,
    };

    if (dry) {
      console.log(`  + ${c.domain.padEnd(30)} draft (dry) via ${c.source}`);
      inserted++;
      continue;
    }

    const { error } = await svc
      .from("winning_sites")
      .upsert(row, { onConflict: "url" });
    if (error) {
      console.log(`  ✗ ${c.domain.padEnd(30)} ${error.message}`);
      failed++;
    } else {
      console.log(`  + ${c.domain.padEnd(30)} draft via ${c.source}`);
      inserted++;
    }
  }

  await sleep(500); // be polite between niches
}

console.log(
  `\nDone. ${inserted} draft(s) added/updated, ${failed} failed.` +
    (dry
      ? ""
      : "\n\nNext:\n" +
        "  1. npm run library:verify      → probe, validate, publish the good ones\n" +
        "  2. npm run library:momentum    → ad counts, revenue range, momentum score\n" +
        "  3. npm run library:thumbs      → real screenshots into our own storage\n" +
        "  4. npm run library:audit       → confirm the niche coverage is ≥3"),
);
