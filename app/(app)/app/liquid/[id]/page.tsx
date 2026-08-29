import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { BlocksProduct } from "@/lib/blocks/product-json";
import { PreviewPanel, type PreviewProject } from "@/components/blocks/preview-panel";
import { BlockComposer } from "@/components/blocks/block-composer";
import { TokenEditor } from "@/components/blocks/token-editor";
import { ExportPanel } from "@/components/blocks/export-panel";
import { confirmExportPayment, getExportStatus } from "@/app/actions/blocks-export";
import { EXPORT_NOT_CONFIGURED } from "@/lib/blocks/export-pricing";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  /**
   * Settle the purchase the moment they land back here, from Stripe's own copy
   * of the session — before anything renders.
   *
   * The webhook does this too, and normally gets there first. This exists for
   * the case that actually costs money: a delivery that is lost, or that fails
   * after `stripe_events` has already recorded the event id, at which point
   * Stripe's retry is deduped into a no-op and the customer is left having paid
   * for a download they can't reach. Both paths converge on one row because
   * `stripe_session_id` is unique.
   */
  if (sp.checkout) {
    // No .catch(): the action guards its own body and returns rather than
    // rejecting, so a catch here would advertise a hazard that no longer exists.
    await confirmExportPayment(id, sp.checkout);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * Checked here rather than leaning on the layout.
   *
   * `getUser()` RETURNS `{user: null}` on an expired session or a transient
   * GoTrue failure — it doesn't throw — so `user!.id` below was a real
   * `Cannot read properties of null` in the render path. The `(app)` layout
   * does redirect a signed-out visitor, but layout and page render
   * concurrently in the App Router, so that was a race, not a guarantee. The
   * whole point of this commit is that nothing in this render can take the
   * page down.
   */
  if (!user) redirect("/sign-in");

  // RLS already scopes this to the owner; the explicit user_id filter makes the
  // intent readable and keeps the query honest if policies are ever relaxed.
  const { data: project } = await supabase
    .from("blocks_projects")
    .select(
      "id, product_url, product_handle, product_json, design_tokens, token_overrides, block_spec, preview_before_url, preview_after_url, status, error, created_at",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!project) notFound();

  // `as any`: the stale Database type resolves post-0001 tables to `never`.
  // See app/actions/blocks.ts for the full note.
  const row = project as any;
  const product = row.product_json as (BlocksProduct & { currency: string | null }) | null;
  // Read after the eager confirmation above, so a customer returning from
  // Stripe sees the download rather than the buy button.
  const exportStatus = await getExportStatus(id);

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
        Choosing comes FIRST.

        These used to sit below the preview, and the owner's report after
        testing was simply "no los encontré". A catalogue nobody finds is a
        catalogue that does not exist — and a preview with no block chosen is a
        dead end, because there is nothing yet to preview. The gallery leads,
        the correction panel follows it, and the proof sits underneath both.
      */}
      {row.design_tokens && (
        <>
          <section>
            <h2 className="text-sm font-medium text-white/70 mb-3">
              Build your block
            </h2>
            <BlockComposer projectId={row.id} initialSpec={row.block_spec ?? null} />
          </section>

          <section>
            <TokenEditor
              projectId={row.id}
              tokens={row.design_tokens}
              savedOverrides={row.token_overrides ?? {}}
            />
          </section>

        </>
      )}
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
      {/*
        Last, and only once there is a block to buy. Selling the download
        above the proof would be asking for money before showing anything —
        the preview is the argument, and this is what it argues for.
      */}
      <section>
        <h2 className="text-sm font-medium text-white/70 mb-3">
          Take it to your theme
        </h2>
        <ExportPanel
          projectId={row.id}
          paid={exportStatus.paid}
          configured={exportStatus.configured}
          unknown={exportStatus.unknown}
          priceLabel={exportStatus.price?.formatted ?? null}
          hasBlock={Boolean(row.block_spec)}
          notConfiguredMessage={EXPORT_NOT_CONFIGURED}
        />
      </section>
    </div>
  );
}
