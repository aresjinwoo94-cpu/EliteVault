// Read-only Supabase helper for blog data queries (service role, SELECT only).
// Loads .env.local; never prints secrets. Every query in docs/blog-data/ is run through this.
import fs from "node:fs";

export function loadEnv(file = ".env.local") {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

/** GET-only PostgREST select. `query` is the raw query string (e.g. "select=path&path=like./blog/*"). */
export async function select(table, query, { pageSize = 1000, max = 200000 } = {}) {
  const env = loadEnv();
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const rows = [];
  for (let from = 0; from < max; from += pageSize) {
    const res = await fetch(`${base}/rest/v1/${table}?${query}`, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + pageSize - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}
