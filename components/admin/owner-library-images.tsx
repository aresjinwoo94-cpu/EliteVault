"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { uploadLibraryImage } from "@/app/actions/library-images";
import type { LibraryImageRow } from "@/lib/library/admin-images";
import { cn } from "@/lib/utils";

/** Turn a stored public URL into the on-the-fly resized render URL (as the
 *  Library card does), so previews stay light. */
function thumbSrc(url: string | null): string | null {
  if (!url || url.includes("s.wordpress.com/mshots")) return null;
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  return `${url.replace(marker, "/storage/v1/render/image/public/")}?width=240&quality=60`;
}

export function OwnerLibraryImages({ rows }: { rows: LibraryImageRow[] }) {
  const missing = rows.filter((r) => !r.permanent).length;
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-card/40 p-5 md:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl tracking-tight text-white">
            Imágenes de la Library
          </h2>
          <p className="mt-1 text-sm text-white/45">
            Sube una imagen permanente por tienda. Las que faltan aparecen primero.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            missing > 0
              ? "border-warning/30 bg-warning/[0.08] text-warning"
              : "border-success/30 bg-success/[0.08] text-success",
          )}
        >
          {missing > 0 ? `${missing} sin imagen` : "Todas con imagen ✓"}
        </span>
      </header>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {rows.map((r) => (
          <ImageRow key={r.id} row={r} />
        ))}
      </div>
    </section>
  );
}

function ImageRow({ row }: { row: LibraryImageRow }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const src = thumbSrc(row.thumbnail_url);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("siteId", row.id);
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadLibraryImage(fd);
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error || "No se pudo subir");
      }
    });
    e.target.value = "";
  }

  return (
    <div
      className={cn(
        "glow-card flex items-center gap-3 rounded-xl border bg-black/20 p-3",
        row.permanent || done
          ? "border-white/[0.06]"
          : "border-warning/25",
      )}
    >
      {/* Thumb / letter preview */}
      <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-white/[0.06] bg-obsidian-900">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={row.title} className="size-full object-cover object-top" />
        ) : (
          <div className="grid size-full place-items-center" style={{ background: "var(--grad-brand)" }}>
            <span className="font-serif text-lg text-obsidian-950/80">
              {row.domain.replace(/^www\./, "").charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{row.title || row.domain}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-white/40">
          <span className="capitalize">{row.niche}</span>
          <span>·</span>
          <span className="truncate">{row.domain}</span>
        </p>
        {error && <p className="mt-0.5 text-[11px] text-destructive">{error}</p>}
      </div>

      {done || row.permanent ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="size-4 shrink-0 text-warning" />
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="glow-secondary inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-xs text-white/70 hover:text-white disabled:opacity-50"
      >
        <Upload className="size-3.5" />
        {pending ? "Subiendo…" : row.permanent ? "Reemplazar" : "Subir"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={onPick}
        className="hidden"
      />
    </div>
  );
}
