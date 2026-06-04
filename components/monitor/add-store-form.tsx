"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import {
  addMonitoredStore,
  type MonitorActionResult,
} from "@/app/actions/monitoring";

/**
 * Add a store to monitoring. `kind` is fixed by the caller (self vs
 * competitor) so the form can live in two places with the right copy.
 */
export function AddStoreForm({
  kind,
  competitorsLeft,
}: {
  kind: "self" | "competitor";
  competitorsLeft?: number;
}) {
  const [state, action, pending] = useActionState<
    MonitorActionResult | null,
    FormData
  >(addMonitoredStore, null);

  const disabled =
    pending || (kind === "competitor" && (competitorsLeft ?? 0) <= 0);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex gap-2">
        <input
          name="url"
          type="text"
          required
          placeholder={
            kind === "self" ? "yourstore.com" : "competitor.com"
          }
          disabled={disabled}
          className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-champagne-400/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.1] transition-colors disabled:opacity-40"
        >
          <Plus className="size-4" />
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state && !state.ok && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
      {kind === "competitor" && (competitorsLeft ?? 0) <= 0 && (
        <p className="text-xs text-white/40">
          You&apos;ve reached your plan&apos;s competitor limit.
        </p>
      )}
    </form>
  );
}
