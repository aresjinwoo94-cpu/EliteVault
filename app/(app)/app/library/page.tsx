import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LibraryView } from "@/components/library/library-view";
import { searchLibrary, getNiches, getLibraryStats } from "@/app/actions/search";
import { getSavedSiteIds } from "@/app/actions/saved-sites";

export const metadata = { title: "Library" };

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
