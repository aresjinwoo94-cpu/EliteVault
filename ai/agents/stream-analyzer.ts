import "server-only";
import { runAnalyzerAgent } from "./analyzer-agent";
import type { BuyerPersona } from "@/lib/supabase/types";

/**
 * Streaming wrapper around the analyzer. Emits coarse-grained progress
 * phases the UI can render while the (non-streaming) generation runs.
 *
 * Both Gemini and Anthropic technically support streaming for the partial
 * JSON, but the parsing complexity isn't worth it here — the heaviest
 * lifting (vision) blocks until the first delta anyway. We chunk progress
 * for premium UX feel and return the fully validated result at the end.
 */
export async function* streamAnalyzerAgent(opts: {
  screenshotBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  url?: string;
  persona?: BuyerPersona | null;
}): AsyncGenerator<
  | { kind: "progress"; phase: string }
  | { kind: "done"; result: unknown }
  | { kind: "error"; message: string }
> {
  const phases = [
    "Reading visual hierarchy",
    "Scoring against CRO rubric",
    "Placing annotations on screenshot",
    "Synthesizing buyer persona response",
  ];

  let cancelled = false;
  const phasePump = (async function* () {
    for (const phase of phases) {
      if (cancelled) return;
      yield { kind: "progress" as const, phase };
      await new Promise((r) => setTimeout(r, 2200));
    }
  })();

  // Pump phases until generation completes
  const generation = runAnalyzerAgent(opts).then(
    (r) => ({ ok: true as const, value: r }),
    (e) => ({ ok: false as const, error: e as Error }),
  );

  // interleave: each tick of phasePump yields a progress event
  for await (const ev of phasePump) {
    yield ev;
    // Race: if generation finishes mid-phase, stop early
    const done = await Promise.race([
      generation,
      new Promise<null>((r) => setTimeout(() => r(null), 100)),
    ]);
    if (done && "ok" in done) break;
  }

  const result = await generation;
  cancelled = true;
  if (result.ok) {
    yield { kind: "done", result: result.value };
  } else {
    yield { kind: "error", message: result.error.message };
  }
}
