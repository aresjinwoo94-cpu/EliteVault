"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { setShareSettings } from "@/app/actions/share-admin";
import type { OwnerSharedAudit } from "@/lib/admin/shared-audits";
import { cn } from "@/lib/utils";

const NOTE_MAX = 280;

const ERROR_ES: Record<string, string> = {
  forbidden: "No tienes permiso.",
  note_too_long: `La nota admite hasta ${NOTE_MAX} caracteres.`,
  not_shared: "Esa auditoría no está compartida.",
};

const VERDICT_LABEL: Record<string, string> = {
  ready: "Ready",
  almost: "Almost ready",
  not_ready: "Not ready",
};

/**
 * Panel del dueño: auditorías públicas (/s/<slug>). Por auditoría:
 *   • nota personal opcional ("Prepared by Ariel for <domain>", arriba en la página pública);
 *   • indexable sí/no (por defecto NO: noindex y fuera del sitemap; solo para auditorías que el dueño
 *     de la tienda publicó o reclamó, con contenido v2 completo y captura no bloqueada);
 *   • "Copy outreach message": copia un mensaje corto con el dominio, el veredicto, un hallazgo ya visible
 *     en la página pública y el enlace con UTM. No envía nada.
 */
export function OwnerSharedAudits({ rows, ready }: { rows: OwnerSharedAudit[]; ready: boolean }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-card p-5 md:p-6" aria-labelledby="owner-shared-h">
      <h2 id="owner-shared-h" className="font-display text-lg tracking-tight text-white">
        Auditorías públicas (/s/)
      </h2>
      <p className="mt-1 max-w-[75ch] text-xs leading-relaxed text-white/45">
        Por defecto cada enlace es no listado (noindex, fuera del sitemap). Marca &quot;Indexable&quot; solo si el dueño
        de la tienda publicó o reclamó la auditoría. El mensaje de outreach solo copia texto; no envía nada.
      </p>
      {!ready ? (
        <p className="mt-4 text-sm text-warning">
          Falta aplicar la migración 0045 (nota personal e indexación). Hasta entonces todas las auditorías públicas son
          no listadas y no tienen nota.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-white/50">Todavía no hay auditorías compartidas.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/[0.06]">
          {rows.map((r) => (
            <SharedRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SharedRow({ r }: { r: OwnerSharedAudit }) {
  const router = useRouter();
  const [note, setNote] = useState(r.note ?? "");
  const [indexable, setIndexable] = useState(r.indexable);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const dirty = note.trim() !== (r.note ?? "") || indexable !== r.indexable;
  const canIndex = r.fullV2 && !r.captureBlocked;

  function save() {
    setMsg(null);
    start(async () => {
      const res = await setShareSettings({ analysisId: r.id, note: note.trim() || null, indexable });
      setMsg(res.ok ? "Guardado" : (ERROR_ES[res.error] ?? res.error));
      if (res.ok) router.refresh();
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(r.outreach);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg("No se pudo copiar; selecciona el texto a mano.");
    }
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={`/s/${r.slug}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-sm text-white hover:text-signal-300"
        >
          {r.domain}
          <ExternalLink className="size-3" />
        </a>
        {r.verdict && (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60">
            {VERDICT_LABEL[r.verdict] ?? r.verdict}
          </span>
        )}
        {r.ageDays != null && <span className="text-[11px] text-white/40">hace {r.ageDays} d</span>}
        {!r.fullV2 && <Flag>pre-v2</Flag>}
        {r.captureBlocked && <Flag>captura bloqueada</Flag>}
        {r.stale && r.fullV2 && <Flag>antigua</Flag>}
        <span className={cn("text-[11px]", r.indexed ? "text-success" : "text-white/40")}>
          {r.indexed ? "indexada" : "no listada"}
        </span>
      </div>

      <label className="mt-3 block text-[11px] uppercase tracking-widest text-white/40" htmlFor={`note-${r.id}`}>
        Nota personal ({note.length}/{NOTE_MAX})
      </label>
      <textarea
        id={`note-${r.id}`}
        value={note}
        maxLength={NOTE_MAX}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Opcional. Aparece arriba como “Prepared by Ariel for …”."
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:border-signal-400/50 focus:outline-none"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className={cn("inline-flex items-center gap-2 text-xs", canIndex ? "text-white/70" : "text-white/30")}>
          <input
            type="checkbox"
            checked={indexable}
            disabled={!canIndex && !indexable}
            onChange={(e) => setIndexable(e.target.checked)}
          />
          Indexable
          {!canIndex && <span className="text-[11px]">(necesita contenido v2 completo y captura no bloqueada)</span>}
        </label>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
        >
          <Check className="size-3.5" />
          Guardar
        </button>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-signal-400/30 bg-signal-500/[0.08] px-3 py-1.5 text-xs text-signal-200 transition-colors hover:bg-signal-500/[0.15]"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy outreach message"}
        </button>
        <span className="inline-flex items-center gap-1 text-[11px] text-white/35">
          <Link2 className="size-3" /> utm_source=share · utm_medium=outreach
        </span>
        {msg && <span className="text-xs text-white/55">{msg}</span>}
      </div>
    </li>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning">{children}</span>;
}
