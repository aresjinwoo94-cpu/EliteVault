import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LibraryView } from "@/components/library/library-view";
import { searchLibrary, getNiches, getLibraryStats } from "@/app/actions/search";
import { getSavedSiteIds } from "@/app/actions/saved-sites";

// NOTE: /app/* is disallowed in robots.txt (dashboard, not indexed), so this
// description/keywords are for the browser tab + completeness, not Google
// ranking. To make the winning-stores library DISCOVERABLE on Google it needs
// a public landing page (see the SEO follow-up).
export const metadata = {
  title: "Library",
  description:
    "Browse a curated library of winning ecommerce stores actually generating revenue — filter by niche, study what converts, and search by image similarity.",
  keywords: [
    "winning shopify stores",
    "winning ecommerce stores library",
    "best dtc stores",
    "winning store database",
    "ecommerce design inspiration",
  ],
};

export default async function LibraryPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ items }, niches, savedIds, stats, profile] = await Promise.all([
    searchLibrary({ limit: 48 }),
    getNiches(),
    user ? getSavedSiteIds() : Promise.resolve(new Set<string>()),
    getLibraryStats(),
    user
      ? supabase
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .single()
          .then(({ data }) => data)
      : Promise.resolve(null),
  ]);

  return (
    <LibraryView
      initialItems={items}
      niches={niches}
      savedIds={Array.from(savedIds)}
      stats={stats}
      plan={profile?.plan ?? "free"}
    />
  );
}
