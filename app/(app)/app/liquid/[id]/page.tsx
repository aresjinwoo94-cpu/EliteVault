import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { BlocksProduct } from "@/lib/blocks/product-json";
import { PreviewPanel, type PreviewProject } from "@/components/blocks/preview-panel";

export const metadata = { title: "Liquid Blocks — project" };

/** Cents → a display string, using the store's own currency when we know it. */
function money(cents: number, currency: string | null): string {
  if (!currency) return (cents / 100).toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export default async function LiquidProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS already scopes this to the owner; the explicit user_id filter makes the
  // intent readable and keeps the query honest if policies are ever relaxed.
  const { data: project } = await supabase
    .from("blocks_projects")
    .select(
      "id, product_url, product_handle, product_json, design_tokens, preview_before_url, preview_after_url, status, error, created_at",
    )
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!project) notFound();

  // `as any`: the stale Database type resolves post-0001 tables to `never`.
  // See app/actions/blocks.ts for the full note.
  const row = project as any;
  const product = row.product_json as (BlocksProduct & { currency: string | null }) | null;

  return (
    <div className="p-6 md:p-10 lg:p-12 pt-10 md:pt-14 max-w-5xl mx-auto space-y-8">
      <div>
        <Link
          href="/app/liquid"
          className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Liquid Blocks
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight leading-tight min-w-0">
            {product?.title ?? row.product_handle}
          </h1>
          <Badge variant={row.status === "ready" ? "success" : row.status === "failed" ? "danger" : "ai"}>
            {row.status}
          </Badge>
        </div>
        <a
          href={row.product_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-xs text-white/40 hover:text-white/70 truncate transition-colors"
        >
          {row.product_url}
        </a>
      </div>

      {/*
        The failure message lives inside PreviewPanel, next to the retry button
        that acts on it. Repeating it here as a banner too would say the same
        thing twice and separate the problem from its remedy.
      */}

      {/*
        What we READ from the store, shown back verbatim. This is the feature's
        core claim made checkable: every number here came from the store's own
        product endpoint, so if one looks wrong the user finds out now — before
        a block is built on top of it — rather than after pasting Liquid into
        their theme.
      */}
      <section>
        <h2 className="text-sm font-medium text-white/70 mb-3">
          What we read from your store
        </h2>
        <Card className="p-5 border-white/[0.04]">
          {product ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
              <div className="min-w-0">
                <dt className="text-white/40 text-xs uppercase tracking-widest">Title</dt>
                <dd className="mt-0.5 text-white/90 truncate">{product.title}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-white/40 text-xs uppercase tracking-widest">Price</dt>
                <dd className="mt-0.5 text-white/90 num">
                  {money(product.priceCents, product.currency)}
                  {product.compareAtCents !== null && (
                    <span className="ml-2 text-white/35 line-through">
                      {money(product.compareAtCents, product.currency)}
                    </span>
                  )}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-white/40 text-xs uppercase tracking-widest">Vendor</dt>
                <dd className="mt-0.5 text-white/90 truncate">
                  {product.vendor ?? <span className="text-white/30">—</span>}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-white/40 text-xs uppercase tracking-widest">
                  Variants
                </dt>
                <dd className="mt-0.5 text-white/90">{product.variants.length}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-white/40">
              We haven&apos;t read this product&apos;s data yet.
            </p>
          )}
        </Card>
      </section>

      {/*
        WP-C turns the measured tokens into editable fields and adds the four
        MVP block types; WP-D adds the paid export. What renders today is the
        calibration and its proof.
      */}
      <section>
        <h2 className="text-sm font-medium text-white/70 mb-3">Preview</h2>
        <PreviewPanel
          initial={{
            id: row.id,
            status: row.status,
            design_tokens: row.design_tokens,
            preview_before_url: row.preview_before_url,
            preview_after_url: row.preview_after_url,
            error: row.error,
          } satisfies PreviewProject}
        />
      </section>
    </div>
  );
}
