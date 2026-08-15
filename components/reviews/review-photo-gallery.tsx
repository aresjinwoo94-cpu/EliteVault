"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ReviewPhoto } from "@/lib/reviews/types";

/** On-the-fly resized render URL for a stored public photo (light thumbnails). */
function thumb(url: string, width: number): string {
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  return `${url.replace(marker, "/storage/v1/render/image/public/")}?width=${width}&quality=70`;
}

/**
 * Public review photos: centered, tappable thumbnails that open a full-size
 * zoom (lightbox) in the shared Dialog. Client island inside the otherwise
 * server-rendered ReviewCard. Shows up to 4 thumbnails.
 */
export function ReviewPhotoGallery({
  photos,
  authorName,
}: {
  photos: ReviewPhoto[];
  authorName: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const shown = photos.slice(0, 4);

  return (
    <>
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        {shown.map((p, i) => (
          <button
            key={p.path}
            type="button"
            onClick={() => setOpenIdx(i)}
            aria-label="Ampliar foto"
            className="group relative size-20 overflow-hidden rounded-xl border border-white/[0.06] transition-colors hover:border-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-400/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb(p.url, 320)}
              alt=""
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      <Dialog open={openIdx !== null} onOpenChange={(v) => !v && setOpenIdx(null)}>
        <DialogContent className="max-w-3xl border-white/10 bg-obsidian-900/95 p-2 sm:p-3">
          <DialogTitle className="sr-only">
            Foto de la reseña de {authorName}
          </DialogTitle>
          {openIdx !== null && (
            // Full-resolution object URL for the zoom view (no transform).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown[openIdx].url}
              alt=""
              className="mx-auto max-h-[82vh] w-auto max-w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
