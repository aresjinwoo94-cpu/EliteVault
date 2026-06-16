"use client";

import { useEffect, useState } from "react";
import { Trash2, Clock, AlertTriangle } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";
import { MetricChip } from "@/components/ui/metric-chip";
import { removeMonitoredStore } from "@/app/actions/monitoring";
import { cn } from "@/lib/utils";
import type { StoreOverview } from "@/lib/monitoring";

/**
 * One monitored store: keeps the big gold per-store score motif, adds the
 * weekly score sparkline + a Current / Δ this week / Best MetricChip row
 * (M1), and a client-side "alert below" threshold persisted in localStorage
 * (M3 — no schema, no server write). Reads come from score_snapshots.
 */

function deltaNode(delta: number | null) {
  if (delta == null) return <span className="num text-white/40">—</span>;
  if (delta === 0) return <span className="num text-white/50">±0</span>;
  const up = delta > 0;
  return (
    <span className={cn("num", up ? "text-success" : "text-destructive")}>
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

export function StoreOverviewCard({ store }: { store: StoreOverview }) {
  const key = `ev_monitor_threshold_${store.id}`;
  const [threshold, setThreshold] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      setThreshold(raw != null && raw !== "" ? Number(raw) : null);
    } catch {
      /* localStorage unavailable — feature simply stays off */
    }
    setHydrated(true);
  }, [key]);

  function update(v: string) {
    const n = v === "" ? null : Math.max(0, Math.min(100, Math.round(Number(v))));
    setThreshold(Number.isNaN(n as number) ? null : n);
    try {
      if (n == null || Number.isNaN(n)) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, String(n));
    } catch {
      /* ignore */
    }
  }

  const atRisk =
    hydrated &&
    threshold != null &&
    store.current != null &&
    store.current < threshold;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.02] p-4 transition-colors",
        atRisk ? "border-destructive/40" : "border-white/[0.06]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/90">
            {store.label ?? store.domain}
          </p>
          <p className="truncate text-xs text-white/40">{store.url}</p>
          {store.last_audited_at && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-white/35">
              <Clock className="size-3" />
              checked{" "}
              {new Date(store.last_audited_at).toLocaleDateString("en-US")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {store.current != null ? (
            <span className="num text-2xl text-gold-gradient leading-none">
              {store.current}
              <span className="ml-0.5 text-xs text-white/40">/100</span>
            </span>
          ) : (
            <span className="text-sm text-white/30">not yet checked</span>
          )}
          <form action={removeMonitoredStore}>
            <input type="hidden" name="id" value={store.id} />
            <button
              type="submit"
              aria-label="Remove"
              className="rounded-md p-1.5 text-white/30 hover:text-destructive hover:bg-white/[0.04] transition-colors"
            >
              <Trash2 className="size-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Trend + stats (from score_snapshots history) */}
      <div className="mt-3 flex items-center gap-4">
        <Sparkline
          data={store.series.map((p) => p.score)}
          width={96}
          height={28}
          ariaLabel={`${store.domain} weekly score trend`}
        />
        <div className="grid flex-1 grid-cols-3 gap-2">
          <MetricChip label="Current" value={store.current ?? "—"} />
          <MetricChip label="Δ this week" value={deltaNode(store.delta)} />
          <MetricChip label="Best" value={store.best ?? "—"} />
        </div>
      </div>

      {/* Alert threshold — client-side only (localStorage), honest copy */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-2.5">
        <label className="flex items-center gap-2 text-[11px] text-white/45">
          Alert below
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={threshold ?? ""}
            onChange={(e) => update(e.target.value)}
            placeholder="—"
            className="num w-14 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white/80 outline-none focus:border-signal-400/40"
          />
        </label>
        {atRisk ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive ring-1 ring-destructive/20">
            <AlertTriangle className="size-3" />
            Below your alert
          </span>
        ) : (
          <span className="text-[10px] text-white/30">
            Flagged here; emailed with the weekly digest
          </span>
        )}
      </div>
    </div>
  );
}
