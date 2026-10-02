/**
 * Per-audit timings (docs/analyzer-speed-fix-free-tier.md §5.2).
 *
 * Until now the only latency we could measure was `finished_at - created_at`,
 * which can't say WHERE the time went (capture? the vision call? a step retry?)
 * nor which model answered. This is a small jsonb written next to the result so
 * scripts/analyzer-latency-report.mjs can answer that per audit.
 *
 * Strictly best-effort: the column comes from migration 0034, applied as a
 * manual ops step. Nothing here may ever be the reason an audit fails.
 */

/** What the run-analyzer-agent step learns about its own vision call. */
export type VisionTiming = {
  /** Wall-clock of runAnalyzerAgent in the attempt that succeeded. */
  visionMs: number;
  /** Inngest attempt (1-based) of the vision step that succeeded. */
  attempt: number;
  /** The model that produced the answer we kept, when the provider said. */
  model?: string;
  hedged?: boolean;
  fellBackFrom?: string;
  modelSwitched?: boolean;
};

export type AnalysisTimings = {
  v: 1;
  captureMs: number | null;
  captureCached: boolean | null;
  visionMs: number | null;
  saveMs: number;
  /** From mark-running (run start, after any queue wait) to the save. */
  totalMs: number;
  model: string | null;
  attempts: { vision: number | null };
  hedged: boolean | null;
  fellBackFrom: string | null;
  modelSwitched: boolean;
};

/**
 * The run-analyzer-agent step now returns `{ audit, timing }`. A run that was
 * already in flight when this shipped has the OLD output memoized — the bare
 * audit — and Inngest replays that on the next invocation. Both must work.
 */
export function unwrapAnalyzerStep<A>(out: unknown): {
  audit: A;
  timing: VisionTiming | null;
} {
  if (
    out &&
    typeof out === "object" &&
    "audit" in out &&
    "timing" in out &&
    (out as { audit: unknown }).audit &&
    typeof (out as { audit: unknown }).audit === "object"
  ) {
    const o = out as { audit: A; timing: VisionTiming | null };
    return { audit: o.audit, timing: o.timing ?? null };
  }
  return { audit: out as A, timing: null };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

export function buildAnalysisTimings(input: {
  capture?: { ms?: unknown; cached?: unknown } | null;
  vision: VisionTiming | null;
  saveMs: number;
  runStartedAtMs: number;
  now?: number;
}): AnalysisTimings {
  const v = input.vision;
  return {
    v: 1,
    captureMs: num(input.capture?.ms),
    captureCached:
      typeof input.capture?.cached === "boolean" ? input.capture.cached : null,
    visionMs: num(v?.visionMs),
    saveMs: num(input.saveMs) ?? 0,
    totalMs: num((input.now ?? Date.now()) - input.runStartedAtMs) ?? 0,
    model: typeof v?.model === "string" ? v.model : null,
    attempts: { vision: num(v?.attempt) },
    hedged: typeof v?.hedged === "boolean" ? v.hedged : null,
    fellBackFrom: typeof v?.fellBackFrom === "string" ? v.fellBackFrom : null,
    modelSwitched: v?.modelSwitched === true,
  };
}

type TimingsWriter = {
  from: (table: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Write `analyses.timings`. Never throws and never rejects: a missing column
 * (0034 not applied), a network blip or a bad client all end in a log line.
 */
export async function persistAnalysisTimings(
  service: unknown,
  analysisId: string,
  timings: AnalysisTimings,
): Promise<boolean> {
  try {
    const { error } = await (service as TimingsWriter)
      .from("analyses")
      .update({ timings })
      .eq("id", analysisId);
    if (error) {
      console.warn(
        "[analyzer] timings not persisted (migration 0034 applied?):",
        error.message,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[analyzer] timings skipped:", (err as Error)?.message ?? err);
    return false;
  }
}
