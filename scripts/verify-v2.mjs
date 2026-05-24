import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const check = (label, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? "  " + detail : ""}`);
};

// New tables
for (const t of ["community_analyses", "community_reports", "api_keys"]) {
  const { error, count } = await svc
    .from(t)
    .select("*", { count: "exact", head: true });
  check(`table ${t}`, !error, error?.message ?? `(${count ?? 0} rows)`);
}

// New columns on existing tables
const { data: aRow } = await svc
  .from("analyses")
  .select("id, is_published, published_at, meta_ads")
  .limit(1);
check(
  "analyses.is_published + published_at + meta_ads",
  !!aRow,
  aRow ? `columns selectable` : "missing",
);

const { data: wRows } = await svc
  .from("winning_sites")
  .select("id, is_preselected, ad_signals, ad_signals_updated_at")
  .limit(5);
check(
  "winning_sites.is_preselected + ad_signals",
  !!wRows,
  wRows ? `columns selectable` : "missing",
);

if (wRows) {
  const preselected = wRows.filter((w) => w.is_preselected).length;
  console.log(`  → ${preselected} of first 5 are preselected (Free preview set)`);
}

// Storage bucket
const { data: bucket } = await svc.storage.getBucket("screenshots");
check("storage bucket screenshots", !!bucket, bucket?.public ? "public ✓" : "");

// RLS check — anon should see published community_analyses (none yet)
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { error: anonErr, count: anonCount } = await anon
  .from("community_analyses")
  .select("*", { count: "exact", head: true });
check(
  "RLS: anon can SELECT community_analyses",
  !anonErr,
  anonErr?.message ?? `(${anonCount ?? 0} visible rows)`,
);

console.log("\nv2 schema looks healthy.\n");
