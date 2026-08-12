import type { AnalysisResult } from "@/lib/supabase/types";

/**
 * Brief §3 — link the report's three separate issue arrays in CODE, with no
 * extra work asked of the model.
 *
 * `top_fixes`, `annotations` and `ad_readiness.blockers` are emitted as three
 * independent lists with no shared id, so the SAME problem (passive CTA, no
 * review count, price below the fold) surfaces two or three times in slightly
 * different words. That's the real cause of the report feeling like repeated
 * modules.
 *
 * We do NOT ask the model to emit consistent ids across three arrays (that adds
 * output and fails more often on Flash-Lite). Instead this is a pure,
 * deterministic post-process: normalize each item's text to a keyword set,
 * group by overlap, and assign a stable `issueId`. The UI then shows each issue
 * ONCE as canonical, and renders "fix before you spend" as a FILTERED VIEW of
 * the same set (the issues a blocker maps onto) rather than regenerating text.
 *
 * Deterministic in, deterministic out: the same AnalysisResult always yields
 * the same ids, so nothing needs persisting for the mapping to be stable.
 */

export type IssueSource = "fix" | "annotation" | "blocker";

export type IssueSeverity = "low" | "medium" | "high";

const SEVERITY_RANK: Record<IssueSeverity, number> = { low: 0, medium: 1, high: 2 };

export interface LinkedIssueRef {
  source: IssueSource;
  /** Index into the corresponding source array on the AnalysisResult. */
  index: number;
  title: string;
}

export interface CanonicalIssue {
  issueId: string;
  /** The best display title (prefers a top_fix, then a blocker, then an annotation). */
  title: string;
  /**
   * Stable hash of the issue's salient stems (brief D1). Unlike `issueId` — which
   * is POSITIONAL and only stable within one run — the fingerprint is stable
   * ACROSS runs for the same underlying problem, so a later audit can recognize
   * a resolved/new issue. Two slightly-reworded phrasings of the same problem
   * hash differently, so the diff never trusts fingerprint EQUALITY — it uses the
   * fuzzy `sameIssue` matcher (see diffIssues). The fingerprint is the compact
   * thing we persist, not the equality test.
   */
  fingerprint: string;
  /** Worst severity among the items that collapsed into this issue. */
  severity: IssueSeverity;
  /** Every array item that collapsed into this issue. */
  refs: LinkedIssueRef[];
  /** True when at least one ad_readiness blocker maps here (the "fix before you spend" filter). */
  blocksPaidTraffic: boolean;
}

export interface LinkedIssues {
  issues: CanonicalIssue[];
  /** Lookup: `${source}:${index}` → issueId. */
  refToIssueId: Record<string, string>;
}

/**
 * Words too generic to carry meaning when matching two issues — includes the
 * short function words that survive the 2-char floor (which we keep so salient
 * tokens like "h1" / "cta" aren't dropped).
 */
const STOP = new Set([
  "the","a","an","to","of","for","and","or","your","you","in","on","is","it",
  "this","that","with","add","fix","make","use","above","below","fold","page",
  "store","site","product","cold","traffic","visitor","visitors","buyer","buy",
  "before","spend","spending","move","put","show","clear","need","needs","not",
  "no","as","at","be","by","do","so","we","us","my","are","its","has","was",
]);

/**
 * Light stemmer: strip a common inflectional suffix then a trailing silent "e",
 * so "reviews" ≈ "review", "stated" ≈ "state", "badges" ≈ "badge" all collapse
 * to a shared stem. Deliberately crude — it only needs to make near-identical
 * problem phrasings match, not to be linguistically correct.
 */
function stem(w: string): string {
  const base = w.replace(/(ing|ed|es|s)$/, "");
  return base.length > 3 ? base.replace(/e$/, "") : base;
}

/** Salient keyword stems from a title (lowercased, de-stopworded, stemmed). */
function keywords(text: string): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP.has(w))
      .map(stem)
      .filter((w) => w.length >= 2),
  );
}

/**
 * Stable fingerprint for an issue (brief D1): a hash of its salient stems,
 * order-independent. Same problem → same fingerprint regardless of word order;
 * a genuine rewording → different fingerprint (which is why the diff matches on
 * `sameIssue`, not on this). Pure and deterministic — nothing is persisted for
 * the mapping to stay stable. FNV-1a keeps it dependency-free and short.
 */
export function issueFingerprint(kw: Set<string>): string {
  const key = [...kw].sort().join(" ");
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "f" + (h >>> 0).toString(16).padStart(8, "0");
}

/** Jaccard overlap of two keyword sets (0..1). */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Two issues are "the same" when they share two salient stems, or overlap
 * strongly by Jaccard, or one keyword set is fully contained in the other.
 * Two shared salient stems (e.g. {review, count}) is a reliable "same topic"
 * signal on the short titles the model emits.
 */
function sameIssue(a: Set<string>, b: Set<string>): boolean {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  if (shared >= 2) return true;
  if (shared >= 1 && overlap(a, b) >= 0.5) return true;
  // Containment: "no reviews" vs "no review count near the buy button".
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size >= 2) {
    let contained = 0;
    for (const w of small) if (big.has(w)) contained++;
    if (contained === small.size) return true;
  }
  return false;
}

/**
 * Group the result's fixes, annotations and blockers into canonical issues.
 *
 * Ordering priority when seeding groups: top_fixes first (they carry the
 * owner-facing action + why), then blockers, then annotations. So a fix's title
 * wins as the canonical display text when items merge.
 */
export function linkIssues(result: AnalysisResult): LinkedIssues {
  const refs: { ref: LinkedIssueRef; kw: Set<string>; severity: IssueSeverity }[] = [];

  (result.top_fixes ?? []).forEach((f, index) => {
    if (f?.title?.trim())
      refs.push({
        ref: { source: "fix", index, title: f.title.trim() },
        kw: keywords(f.title),
        // A fix's leverage maps to how badly the issue leaks money.
        severity: f.impact ?? "medium",
      });
  });
  (result.ad_readiness?.blockers ?? []).forEach((b, index) => {
    if (b?.title?.trim())
      refs.push({
        ref: { source: "blocker", index, title: b.title.trim() },
        kw: keywords(b.title),
        // Anything that must be fixed BEFORE spending is high severity.
        severity: "high",
      });
  });
  (result.annotations ?? []).forEach((a, index) => {
    // Annotations describe the problem in `message`; that's what to match on.
    const title = (a?.message ?? "").trim();
    if (title)
      refs.push({
        ref: { source: "annotation", index, title },
        kw: keywords(title),
        severity: a.severity ?? "medium",
      });
  });

  // Working groups carry the matching state (keyword set + which source owns the
  // display title); the public CanonicalIssue is derived from them at the end.
  type Group = {
    issue: CanonicalIssue;
    kw: Set<string>;
    titleSource: IssueSource;
  };
  const groups: Group[] = [];

  const worse = (a: IssueSeverity, b: IssueSeverity): IssueSeverity =>
    SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;

  for (const { ref, kw, severity } of refs) {
    const match = groups.find((g) => sameIssue(g.kw, kw));
    if (match) {
      match.issue.refs.push(ref);
      match.issue.severity = worse(match.issue.severity, severity);
      // Grow the group's keyword set so transitive matches still land.
      for (const w of kw) match.kw.add(w);
      if (ref.source === "blocker") match.issue.blocksPaidTraffic = true;
      // A fix title outranks a blocker/annotation title for display.
      if (ref.source === "fix" && match.titleSource !== "fix") {
        match.issue.title = ref.title;
        match.titleSource = "fix";
      } else if (ref.source === "blocker" && match.titleSource === "annotation") {
        match.issue.title = ref.title;
        match.titleSource = "blocker";
      }
    } else {
      groups.push({
        issue: {
          issueId: `issue-${groups.length + 1}`,
          title: ref.title,
          fingerprint: "", // filled once the group's keyword set is final
          severity,
          refs: [ref],
          blocksPaidTraffic: ref.source === "blocker",
        },
        kw: new Set(kw),
        titleSource: ref.source,
      });
    }
  }

  // Fingerprint from the FINAL keyword set (after all transitive merges), so it
  // reflects the whole issue, not just the seed phrasing.
  for (const g of groups) g.issue.fingerprint = issueFingerprint(g.kw);

  const issues = groups.map((g) => g.issue);
  const refToIssueId: Record<string, string> = {};
  for (const iss of issues) {
    for (const r of iss.refs) refToIssueId[`${r.source}:${r.index}`] = iss.issueId;
  }

  return { issues, refToIssueId };
}

/**
 * The "fix before you spend" filtered view (brief §3): the canonical issues
 * that at least one ad-readiness blocker maps onto. This REPLACES rendering the
 * blockers as their own separately-worded list — it's the same issue set,
 * filtered, so the marker on the screenshot and the fix in the roadmap line up.
 */
export function paidTrafficBlockers(linked: LinkedIssues): CanonicalIssue[] {
  return linked.issues.filter((i) => i.blocksPaidTraffic);
}

/**
 * The compact per-issue record persisted to growth_map_history (brief D3): just
 * enough to recognize the same problem on a later run and narrate it. Kept tiny
 * on purpose — it's stored as jsonb per placement point.
 */
export interface IssueSnapshot {
  fingerprint: string;
  title: string;
  severity: IssueSeverity;
}

/** Reduce the linked issues to the snapshot we persist. */
export function snapshotIssues(linked: LinkedIssues): IssueSnapshot[] {
  return linked.issues.map((i) => ({
    fingerprint: i.fingerprint,
    title: i.title,
    severity: i.severity,
  }));
}

export interface IssueDiff {
  /** In prev, gone in curr — the owner fixed these since last run. */
  resolved: IssueSnapshot[];
  /** In both runs — still to do. */
  stillOpen: IssueSnapshot[];
  /** New in curr — regressions or newly-surfaced issues. */
  introduced: IssueSnapshot[];
}

/**
 * Diff two runs' issue snapshots (brief D2). Alignment uses the SAME fuzzy
 * `sameIssue` matcher the in-run linker uses — NOT fingerprint equality — because
 * a genuine rewording of the same problem changes the fingerprint but is still
 * the same issue; matching on re-derived keyword sets is what stops "reworded"
 * from reading as "resolved + new". Greedy one-to-one so a single prev issue
 * can't satisfy two curr issues.
 *
 * Pure and deterministic: 0 tokens, no AI, runs off already-persisted data.
 */
export function diffIssues(
  prev: IssueSnapshot[],
  curr: IssueSnapshot[],
): IssueDiff {
  const prevKw = prev.map((p) => keywords(p.title));
  const usedPrev = new Set<number>();
  const stillOpen: IssueSnapshot[] = [];
  const introduced: IssueSnapshot[] = [];

  for (const c of curr) {
    const ckw = keywords(c.title);
    let matchIdx = -1;
    for (let i = 0; i < prev.length; i++) {
      if (usedPrev.has(i)) continue;
      if (sameIssue(prevKw[i], ckw)) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx >= 0) {
      usedPrev.add(matchIdx);
      stillOpen.push(c);
    } else {
      introduced.push(c);
    }
  }

  const resolved = prev.filter((_, i) => !usedPrev.has(i));
  return { resolved, stillOpen, introduced };
}
