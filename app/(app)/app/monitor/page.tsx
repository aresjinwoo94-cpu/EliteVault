import { redirect } from "next/navigation";

/**
 * The Monitor feature (weekly store/competitor re-audit + email digest) was
 * retired to refocus the product on its two pillars — Analyzer + Library.
 * This route is kept only as a permanent redirect so any existing bookmarks
 * or in-flight links land on the Analyzer instead of 404-ing.
 */
export const dynamic = "force-dynamic";

export default function MonitorRetiredRedirect() {
  redirect("/app/analyzer");
}
