import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isRealThumbnail } from "@/lib/library/thumbnail";

export interface LibraryImageRow {
  id: string;
  title: string;
  domain: string;
  niche: string;
  thumbnail_url: string | null;
  /** True when the row has a REAL image (not null / '' / mshots). */
  permanent: boolean;
  status: string;
  /** Why the row is parked in review (no_image, not_a_store, …). */
  reviewReason: string | null;
  /** 'owner' images are protected from every job and script. */
  source: string | null;
  /** Failed automatic attempts; at MAX the job gives up and waits for an upload. */
  attempts: number;
}

/**
 * Every Library store with its image status, for the owner uploader.
 * Stores WITHOUT a permanent (self-hosted) image are sorted first so the owner
 * can finish them off. Read via the service role (owner page is already gated).
 */
export async function getLibraryImageAudit(): Promise<LibraryImageRow[]> {
  try {
    const svc = createSupabaseServiceClient();
    const { data, error } = await svc
      .from("winning_sites")
      .select("id, title, domain, niche, thumbnail_url, status, review_reason, thumbnail_source, thumbnail_attempts")
      .order("niche");
    if (error || !Array.isArray(data)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data as any[]).map((r) => {
      const url: string | null = r.thumbnail_url ?? null;
      const permanent = isRealThumbnail(url);
      return {
        id: String(r.id),
        title: String(r.title ?? ""),
        domain: String(r.domain ?? ""),
        niche: String(r.niche ?? ""),
        thumbnail_url: url,
        permanent,
        status: String(r.status ?? ""),
        reviewReason: (r.review_reason as string | null) ?? null,
        source: (r.thumbnail_source as string | null) ?? null,
        attempts: Number(r.thumbnail_attempts ?? 0),
      };
    });
    // Missing first (published ones — the visible damage — before parked ones), then niche/domain.
    const rank = (r: { permanent: boolean; status: string }) => (r.permanent ? 2 : r.status === "published" ? 0 : 1);
    return rows.sort((a, b) => rank(a) - rank(b) || (a.niche + a.domain).localeCompare(b.niche + b.domain));
  } catch {
    return [];
  }
}
