import Link from "next/link";
import { ArrowUpRight, Blocks } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LiquidLauncher } from "@/components/blocks/liquid-launcher";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

// /app/* is disallowed in robots.txt (dashboard, not indexed) — this metadata
// is for the browser tab, not for ranking. The marketing surface for Liquid
// Blocks is deliberately out of scope for this brief.
export const metadata = {
  title: "Liquid Blocks",
  description:
    "Generate additive Liquid blocks for your Shopify product page, styled with your store's real colours and type, previewed before you touch your theme.",
};

const STATUS_VARIANT = {
  ready: "success",
  failed: "danger",
  queued: "ai",
  capturing: "ai",
} as const;

export default async function LiquidBlocksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: projects } = await supabase
    .from("blocks_projects")
    .select("id, product_url, product_handle, status, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // `as any[]`: the stale Database type resolves post-0001 tables to `never`.
  // See app/actions/blocks.ts for the full note.
  const rows = (projects ?? []) as any[];

  return (
    <div className="p-6 md:p-10 lg:p-12 pt-10 md:pt-14 max-w-6xl mx-auto space-y-8 md:space-y-10">
      <header className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-white/40">
            Liquid Blocks
          </span>
          <Badge variant="ai">
            <Blocks className="size-3" />
            Styled from your store
          </Badge>
        </div>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
          Blocks that already look like{" "}
          <span className="text-gold-gradient">your store.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/50">
          Paste one product page. We measure the colours, type and shapes that
          page actually uses, then show you the block sitting on it — before any
          code goes near your theme.
        </p>
      </header>

      <LiquidLauncher />

      <section>
        <h2 className="text-sm font-medium text-white/70 mb-4">Your projects</h2>
        {rows.length === 0 ? (
          <Card className="p-6 md:p-10 text-center border-white/[0.04]">
            <p className="text-sm text-white/40">
              Nothing here yet — paste a product URL above to start.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((p) => (
              <Link
                key={p.id}
                href={`/app/liquid/${p.id}`}
                className="group flex items-center gap-4 rounded-xl border border-white/[0.04] bg-card/30 px-4 py-3.5 hover:border-white/[0.12] hover:bg-card/60 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white/90 truncate">
                    {p.product_handle}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5 truncate">
                    {p.product_url}
                  </p>
                </div>
                <Badge
                  variant={
                    STATUS_VARIANT[p.status as keyof typeof STATUS_VARIANT] ??
                    "default"
                  }
                >
                  {p.status}
                </Badge>
                <ArrowUpRight className="size-4 text-white/30 group-hover:text-white/70 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
