"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/admin/guard";

const BUCKET = "screenshots";
const PREFIX = "library";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Owner-only: upload a permanent thumbnail for a Library store and set its
 * `winning_sites.thumbnail_url`. The guaranteed "sí o sí" path for any store
 * the automated backfill couldn't cover (no og:image, screenshot blocked).
 * Same bucket/path pattern as the backfill, so it renders identically.
 */
export async function uploadLibraryImage(
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "Unauthorized" };

  const siteId = String(formData.get("siteId") || "");
  const file = formData.get("file");
  if (!siteId) return { ok: false, error: "Missing store id" };
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Please choose an image" };
  if (file.size > MAX_BYTES) return { ok: false, error: "Image is too large (max 8MB)" };

  const ext = EXT[file.type.toLowerCase()];
  if (!ext) return { ok: false, error: "Use a JPG, PNG, WebP or AVIF image" };

  try {
    const svc = createSupabaseServiceClient();

    // Confirm the store exists + grab any prior self-hosted object to clean up.
    const { data: site } = await svc
      .from("winning_sites")
      .select("id, thumbnail_url")
      .eq("id", siteId)
      .maybeSingle();
    if (!site) return { ok: false, error: "Store not found" };

    const buf = Buffer.from(await file.arrayBuffer());
    const path = `${PREFIX}/${siteId}-${Date.now()}.${ext}`;
    const { error: upErr } = await svc.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

    const {
      data: { publicUrl },
    } = svc.storage.from(BUCKET).getPublicUrl(path);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (svc.from("winning_sites") as any)
      .update({ thumbnail_url: publicUrl })
      .eq("id", siteId);
    if (updErr) return { ok: false, error: `Save failed: ${updErr.message}` };

    // Remove a superseded self-hosted object (mshots/external aren't ours).
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const prev = (site as { thumbnail_url: string | null }).thumbnail_url;
    if (base && prev && prev.startsWith(base)) {
      const oldPath = prev.split(`/storage/v1/object/public/${BUCKET}/`)[1];
      if (oldPath && !prev.endsWith(path)) {
        await svc.storage
          .from(BUCKET)
          .remove([decodeURIComponent(oldPath)])
          .catch(() => {});
      }
    }

    revalidatePath("/app/library");
    revalidatePath("/app/owner");
    return { ok: true, url: publicUrl };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
