import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

export const metadata = { title: "Internal · Inference cost" };
export const dynamic = "force-dynamic";

/**
 * INTERNAL cost view (Phase 1 metering).
 *
 * Per-user Gemini/Claude inference cost over the last 30 days, read from the
 * `v_user_cost_30d` view via the service client (RLS-bypassing). Gated to the
 * comma-separated INTERNAL_EMAILS allowlist — anyone else gets bounced to /app.
 * Numbers are ESTIMATES (see lib/usage/meter.ts pricing table).
 */
type CostRow = {
  user_id: string | null;
  email: string | null;
  plan: string | null;
  calls: number | null;
  tokens: number | null;
  cost_usd_30d: number | null;
  last_call_at: string | null;
};

function internalEmails(): string[] {
  return (process.env.INTERNAL_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function InternalCostPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const allow = internalEmails();
  const email = (user.email ?? "").toLowerCase();
  if (allow.length === 0 || !allow.includes(email)) {
    redirect("/app");
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("v_user_cost_30d")
    .select("*")
    .limit(500);
  const rows = (data ?? []) as CostRow[];

  const totalCost = rows.reduce((s, r) => s + (r.cost_usd_30d ?? 0), 0);
  const totalCalls = rows.reduce((s, r) => s + (r.calls ?? 0), 0);
  const fmtUsd = (n: number | null) =>
    `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-obsidian-950 px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <p className="text-[10px] uppercase tracking-widest text-white/40">
          Internal · last 30 days
        </p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight">
          Inference cost per user
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Estimated Gemini/Claude COGS. {rows.length} users ·{" "}
          {totalCalls.toLocaleString("en-US")} calls ·{" "}
          <span className="text-champagne-400">{fmtUsd(totalCost)}</span> total.
        </p>

        {error && (
          <p className="mt-4 text-sm text-destructive">
            Could not load cost view: {error.message}
          </p>
        )}

        <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-white/40 border-b border-white/[0.06]">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium text-right">Calls</th>
                <th className="px-4 py-3 font-medium text-right">Tokens</th>
                <th className="px-4 py-3 font-medium text-right">Cost (30d)</th>
                <th className="px-4 py-3 font-medium text-right">Last call</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                    No usage recorded yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.user_id ?? "system"}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 text-white/80">
                    {r.email ?? (
                      <span className="text-white/35">system / unattributed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/60">{r.plan ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/70">
                    {(r.calls ?? 0).toLocaleString("en-US")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/70">
                    {(r.tokens ?? 0).toLocaleString("en-US")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-champagne-400">
                    {fmtUsd(r.cost_usd_30d)}
                  </td>
                  <td className="px-4 py-3 text-right text-white/40 text-xs">
                    {r.last_call_at
                      ? new Date(r.last_call_at).toLocaleDateString("en-US")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[11px] text-white/30">
          Costs are estimates from a static pricing table (lib/usage/meter.ts),
          not billed amounts. Unattributed rows are system jobs.
        </p>
      </div>
    </div>
  );
}
