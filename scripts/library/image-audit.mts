/**
 * WP-L0 — Library image diagnosis. READ-ONLY: never writes to the DB or Storage.
 *
 *   npx tsx scripts/library/image-audit.mts [--env <path-to-.env.local>] [--out docs/library-image-audit-REPORT.md]
 *
 * For every winning_sites row classifies `thumbnail_url` (empty / mshots / external / own storage)
 * and, for own-storage images, checks: (a) the object exists (HEAD), (b) the `render/image`
 * transformation endpoint the cards use answers 200, (c) original size / dimensions / format.
 * Also lists bucket objects under library/ that no row references (traces of replaced images).
 */
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const envPath = arg("--env", ".env.local");
const outPath = arg("--out", "docs/library-image-audit-REPORT.md");
for (const l of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { createClient } = await import("@supabase/supabase-js");
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const HOST = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^https?:\/\//, "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const { data, error } = await supa.from("winning_sites").select("*").order("niche").order("title");
if (error) throw error;
const rows = data as Row[];

/** Dimensions from the first bytes of PNG / JPEG / WebP / GIF. */
function dims(b: Uint8Array): { w: number; h: number; fmt: string } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { fmt: "png", w: dv.getUint32(16), h: dv.getUint32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49) return { fmt: "gif", w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
  if (b.length > 30 && b[0] === 0x52 && b[8] === 0x57) {
    const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (t === "VP8X") return { fmt: "webp", w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (t === "VP8 ") return { fmt: "webp", w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
    if (t === "VP8L") {
      const v = dv.getUint32(21, true);
      return { fmt: "webp", w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
    }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { fmt: "jpeg", h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
      i += 2 + dv.getUint16(i + 2);
    }
    return { fmt: "jpeg", w: 0, h: 0 };
  }
  return null;
}

const OWN = "/storage/v1/object/public/";
const cls = (u: string | null | undefined) =>
  !u ? "empty" : u.includes("s.wordpress.com/mshots") ? "mshots" : u.includes(OWN) && u.includes(HOST) ? "own" : u.includes(OWN) ? "own-other-project" : "external";
const renderUrl = (u: string) => `${u.replace(OWN, "/storage/v1/render/image/public/")}?width=800&quality=70`;
const fetchT = (u: string, init: RequestInit = {}) => fetch(u, { ...init, signal: AbortSignal.timeout(25_000) });

type Res = { row: Row; kind: string; head?: number; ctype?: string; bytes?: number; w?: number; h?: number; fmt?: string; render?: number; renderErr?: string; note: string };
const out: Res[] = [];
for (const row of rows) {
  const kind = cls(row.thumbnail_url);
  const r: Res = { row, kind, note: "" };
  if (kind === "own") {
    try {
      const head = await fetchT(row.thumbnail_url, { method: "HEAD" });
      r.head = head.status;
      r.ctype = head.headers.get("content-type") ?? "";
      r.bytes = Number(head.headers.get("content-length") ?? 0);
      if (head.ok) {
        const part = await fetchT(row.thumbnail_url, { headers: { Range: "bytes=0-524287" } });
        const d = dims(new Uint8Array(await part.arrayBuffer()));
        if (d) {
          r.w = d.w;
          r.h = d.h;
          r.fmt = d.fmt;
        }
      }
    } catch (e) {
      r.note += `head/get error: ${(e as Error).message}; `;
    }
    try {
      const rr = await fetchT(renderUrl(row.thumbnail_url));
      r.render = rr.status;
      if (!rr.ok) r.renderErr = (await rr.text()).slice(0, 160);
      else await rr.arrayBuffer().catch(() => {});
    } catch (e) {
      r.render = 0;
      r.renderErr = (e as Error).message;
    }
  } else if (kind === "external") {
    try {
      const h = await fetchT(row.thumbnail_url, { method: "HEAD" });
      r.head = h.status;
      r.ctype = h.headers.get("content-type") ?? "";
    } catch (e) {
      r.head = 0;
      r.note = (e as Error).message;
    }
  }
  out.push(r);
}

// "Letter" = what site-card.tsx thumbSrc + onError would end up showing.
const mp = (r: Res) => (r.w && r.h ? (r.w * r.h) / 1e6 : 0);
const letter = (r: Res) => r.kind === "empty" || r.kind === "mshots" || (r.kind === "own" && (r.head !== 200 || r.render !== 200)) || (r.kind === "external" && r.head !== 200) || r.kind === "own-other-project";
const why = (r: Res) =>
  r.kind === "empty" ? "thumbnail_url vacío"
  : r.kind === "mshots" ? "URL de mshots (descartada a propósito por thumbSrc)"
  : r.kind === "own" && r.head !== 200 ? `objeto no existe (HEAD ${r.head})`
  : r.kind === "own" && r.render !== 200 ? `render/image ${r.render}: ${r.renderErr ?? ""}`.replace(/\|/g, "/")
  : r.kind === "external" && r.head !== 200 ? `URL externa HEAD ${r.head}`
  : r.kind === "own-other-project" ? "Storage de otro proyecto"
  : "";

const { data: objs } = await supa.storage.from("screenshots").list("library", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
const referenced = new Set(rows.map((r) => String(r.thumbnail_url ?? "").split("/library/")[1]).filter(Boolean));
const orphans = (objs ?? []).filter((o) => o.name && !referenced.has(o.name));

const pub = out.filter((r) => r.row.status === "published");
const cnt = (f: (r: Res) => boolean, set = out) => set.filter(f).length;
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "-");
const md: string[] = [];
md.push(`# Library — diagnóstico de imágenes (WP-L0)\n\nGenerado: ${new Date().toISOString()} · solo lectura (sin cambios en BD ni Storage) · \`scripts/library/image-audit.mts\`\n`);
md.push(`## Resumen\n\n| | Todas | Publicadas |\n|---|---|---|`);
for (const [label, f] of [
  ["Filas", () => true],
  ["thumbnail_url vacío", (r: Res) => r.kind === "empty"],
  ["mshots", (r: Res) => r.kind === "mshots"],
  ["Externa", (r: Res) => r.kind === "external"],
  ["Propia (Storage)", (r: Res) => r.kind === "own"],
  ["Propia de otro proyecto", (r: Res) => r.kind === "own-other-project"],
  ["**Mostrarían la letra**", letter],
] as [string, (r: Res) => boolean][]) md.push(`| ${label} | ${cnt(f)} | ${cnt(f, pub)} (${pct(cnt(f, pub), pub.length)}) |`);

const own = out.filter((r) => r.kind === "own");
const big = own.filter((r) => mp(r) > 0);
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
md.push(`\n### Imágenes propias (${own.length})\n`);
md.push(`- Objeto existe (HEAD 200): ${cnt((r) => r.head === 200, own)}`);
md.push(`- \`render/image\` responde 200: ${cnt((r) => r.render === 200, own)}`);
md.push(`- \`render/image\` falla aunque el objeto existe: ${cnt((r) => r.head === 200 && r.render !== 200, own)}`);
md.push(`- Megapíxeles del original (mediana / máx): ${big.length ? `${med(big.map(mp)).toFixed(1)} / ${Math.max(...big.map(mp)).toFixed(1)}` : "n/d"}`);
md.push(`- Dimensiones más comunes: ${[...new Set(big.map((r) => `${r.w}×${r.h}`))].slice(0, 6).join(", ") || "n/d"}`);
md.push(`- Formatos: ${Object.entries(own.reduce<Record<string, number>>((a, r) => { const k = r.fmt ?? r.ctype ?? "?"; a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${k}: ${v}`).join(", ") || "n/d"}`);
md.push(`- Peso del original (mediana / máx MB): ${own.length ? `${med(own.map((r) => (r.bytes ?? 0) / 1e6)).toFixed(2)} / ${Math.max(...own.map((r) => (r.bytes ?? 0) / 1e6)).toFixed(2)}` : "n/d"}`);
md.push(`\n#### ¿Falla \`render/image\` según el tamaño del original? (hipótesis 1)\n\n| Megapíxeles | Imágenes | render 200 | render ≠ 200 |\n|---|---|---|---|`);
for (const [lo, hi] of [[0, 2], [2, 8], [8, 25], [25, 1e9]] as const) {
  const g = own.filter((r) => mp(r) >= lo && mp(r) < hi);
  md.push(`| ${lo}–${hi >= 1e9 ? "∞" : hi} | ${g.length} | ${cnt((r) => r.render === 200, g)} | ${cnt((r) => r.render !== 200, g)} |`);
}
const errs = own.filter((r) => r.render !== 200);
if (errs.length) md.push(`\nMensajes de error de render/image (únicos):\n${[...new Set(errs.map((r) => `- ${r.render}: ${r.renderErr}`))].join("\n")}`);
md.push(`\n### Por nicho (publicadas)\n\n| Nicho | Publicadas | Con letra |\n|---|---|---|`);
for (const n of [...new Set(pub.map((r) => r.row.niche))].sort()) {
  const g = pub.filter((r) => r.row.niche === n);
  md.push(`| ${n} | ${g.length} | ${cnt(letter, g)} |`);
}
md.push(`\n### Bucket \`screenshots/library\`\n\n- Objetos listados: ${objs?.length ?? 0} · referenciados por una fila: ${(objs?.length ?? 0) - orphans.length} · **huérfanos** (sin fila que los use): ${orphans.length}`);
for (const o of orphans.slice(0, 15)) md.push(`  - \`${o.name}\` (${o.created_at?.slice(0, 10)})`);
md.push(`\n## Detalle de tiendas que mostrarían la letra\n\n| Estado | Nicho | Tienda | Dominio | Clase | Motivo | MP | Actualizada |\n|---|---|---|---|---|---|---|---|`);
for (const r of out.filter(letter)) md.push(`| ${r.row.status} | ${r.row.niche} | ${r.row.title} | ${r.row.domain_key ?? r.row.domain} | ${r.kind} | ${why(r)} | ${mp(r) ? mp(r).toFixed(1) : ""} | ${String(r.row.updated_at ?? r.row.created_at ?? "").slice(0, 10)} |`);
writeFileSync(outPath, md.join("\n") + "\n");
console.log(`rows=${rows.length} published=${pub.length} letter(all)=${cnt(letter)} letter(published)=${cnt(letter, pub)} own=${own.length} renderFail=${errs.length} orphans=${orphans.length} -> ${outPath}`);
