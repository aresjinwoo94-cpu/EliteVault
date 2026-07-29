import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export interface LibraryImageRow {
  id: string;
  title: string;
  domain: string;
  niche: string;
  thumbnail_url: string | null;
  /** True once the thumbnail lives in our own Storage (permanent). */
  permanent: boolean;
}

/**
 * Every Library store with its image status, for the owner uploader.
 * Stores WITHOUT a permanent (self-hosted) image are sorted first so the owner
 * can finish them off. Read via the service role (owner page is already gated).
 */
export async function getLibraryImageAudit(): Promise<LibraryImageRow[]> {
  try {
    const svc = createSupabaseServiceClient();
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const { data, error } = await svc
      .from("winning_sites")
      .select("id, title, domain, niche, thumbnail_url")
      .order("niche");
    if (error || !Array.isArray(data)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data as any[]).map((r) => {
      const url: string | null = r.thumbnail_url ?? null;
      const permanent = !!base && !!url && url.startsWith(base);
      return {
        id: String(r.id),
        title: String(r.title ?? ""),
        domain: String(r.domain ?? ""),
        niche: String(r.niche ?? ""),
        thumbnail_url: url,
        permanent,
      };
    });
    // Missing (non-permanent) first, then by niche/domain.
    return rows.sort((a, b) => {
      if (a.permanent !== b.permanent) return a.permanent ? 1 : -1;
      return (a.niche + a.domain).localeCompare(b.niche + b.domain);
    });
  } catch {
    return [];
  }
}
