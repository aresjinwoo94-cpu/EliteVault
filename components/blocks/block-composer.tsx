"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveBlockSpec } from "@/app/actions/blocks-compose";
import { requestBlocksPreview } from "@/app/actions/blocks-preview";
import {
  BLOCK_CATALOG,
  TRUST_ICONS,
  type BlockSpecInput,
  type CatalogBlockType,
} from "@/lib/blocks/catalog";

import { BlockGallery, VariantPicker } from "@/components/blocks/block-gallery";

/**
 * Liquid Blocks WP-C — pick a block, and supply the claims it makes.
 *
 * Every field here is empty on arrival, and that is the product working as
 * intended. The brief's hard rule is that a block carrying claims is never
 * autofilled: prefilling "Free shipping" because most stores have it would put
 * a promise on a merchant's product page that they never made, and they'd find
 * out when a customer held them to it.
 *
 * So the forms ask, the server refuses an incomplete spec, and the refusal
 * names what's missing. The one place we're allowed to be helpful is the
 * PLACEHOLDER text — it shows the shape of an answer without ever becoming one.
 */

type Draft = {
  trust_icons: Extract<BlockSpecInput, { type: "trust_icons" }>;
  brand_cards: Extract<BlockSpecInput, { type: "brand_cards" }>;
  comparison: Extract<BlockSpecInput, { type: "comparison" }>;
  feature_grid: Extract<BlockSpecInput, { type: "feature_grid" }>;
  product_stats: Extract<BlockSpecInput, { type: "product_stats" }>;
  spec_table: Extract<BlockSpecInput, { type: "spec_table" }>;
  assurance_bar: Extract<BlockSpecInput, { type: "assurance_bar" }>;
  bundle_tiers: Extract<BlockSpecInput, { type: "bundle_tiers" }>;
  low_stock: Extract<BlockSpecInput, { type: "low_stock" }>;
};

const EMPTY: Draft = {
  trust_icons: {
    type: "trust_icons",
    items: [{ icon: "shipping", label: "", detail: "" }],
  },
  brand_cards: { type: "brand_cards", promise: "", benefits: ["", "", ""], logoUrl: null },
  comparison: {
    type: "comparison",
    competitorName: "",
    rows: [{ label: "", ours: "", theirs: "", weWin: true }],
  },
  feature_grid: {
    type: "feature_grid",
    features: [
      { icon: "shipping", title: "", line: "" },
      { icon: "warranty", title: "", line: "" },
    ],
  },
  product_stats: { type: "product_stats", stats: [{ label: "", value: "", unit: "" }] },
  spec_table: {
    type: "spec_table",
    rows: [
      { label: "", value: "" },
      { label: "", value: "" },
    ],
  },
  assurance_bar: { type: "assurance_bar", items: [{ icon: "returns", text: "" }] },
  /*
   * Seeded with quantities but ZERO discount, deliberately.
   *
   * "Buy 2, save 10%" as a default would be us inventing a discount rule for
   * a shop we know nothing about — and the merchant most likely to accept a
   * prefilled number is the one least likely to check it against their real
   * rules. The quantities are a shape; the percentages are a claim.
   */
  bundle_tiers: {
    type: "bundle_tiers",
    tiers: [
      { quantity: 1, discountPercent: 0, highlight: false },
      { quantity: 2, discountPercent: 0, highlight: false },
    ],
  },
  // A threshold is a preference, not a claim, so a starting point is not an
  // invention — and design-references.md §7 puts "reads as a status" under 10.
  low_stock: { type: "low_stock", threshold: 5 },
};

export function BlockComposer({
  projectId,
  initialSpec,
  onSaved,
}: {
  projectId: string;
  initialSpec: BlockSpecInput | null;
  onSaved?: () => void;
}) {
  const [selected, setSelected] = useState<CatalogBlockType | null>(
    initialSpec?.type ?? null,
  );
  const [draft, setDraft] = useState<Draft>(() =>
    initialSpec ? { ...EMPTY, [initialSpec.type]: initialSpec } : EMPTY,
  );
  const router = useRouter();
  const [missing, setMissing] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const entry = BLOCK_CATALOG.find((b) => b.id === selected);

  function update<K extends CatalogBlockType>(type: K, next: Draft[K]) {
    setDraft((d) => ({ ...d, [type]: next }));
  }

  function submit() {
    if (!selected) return;
    setMissing([]);
    startTransition(async () => {
      const res = await saveBlockSpec(projectId, draft[selected]);
      if (!res.ok) {
        setMissing(res.missing ?? []);
        toast.error(res.error);
        return;
      }
      for (const w of res.warnings) toast.warning(w, { duration: 9000 });
      // Actually re-run it. The toast used to promise a preview that nothing
      // triggered — PreviewPanel only auto-dispatches on a fresh project, so
      // the merchant saw a confirmation, no change, and had to find the
      // "Re-measure" button themselves.
      const run = await requestBlocksPreview(projectId);
      if (!run.ok) {
        toast.error(run.error);
        return;
      }
      toast.success("Saved. Building the preview with your block.");
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-white/70">Choose a block</h3>
        <p className="mt-1 text-xs text-white/40">
          Each one is native Liquid, scoped so it cannot restyle your theme, and
          rendered in the colours and type we measured on your page.
        </p>
        <div className="mt-4">
          <BlockGallery selected={selected} onSelect={setSelected} />
        </div>
      </div>

      {entry && (
        <Card className="p-5 border-white/[0.04]">
          <h4 className="text-sm font-medium text-white/80">{entry.name}</h4>
          <p className="mt-1 text-xs text-white/40">
            We fill in nothing here. Every line below goes on your product page
            as a promise to your buyer, so it has to come from you.
          </p>

          <div className="mt-5 space-y-4">
            {selected === "trust_icons" && (
              <TrustForm
                value={draft.trust_icons}
                onChange={(v) => update("trust_icons", v)}
              />
            )}
            {selected === "brand_cards" && (
              <BrandForm
                value={draft.brand_cards}
                onChange={(v) => update("brand_cards", v)}
              />
            )}
            {selected === "comparison" && (
              <ComparisonForm
                value={draft.comparison}
                onChange={(v) => update("comparison", v)}
              />
            )}
            {selected === "feature_grid" && (
              <FeatureForm
                value={draft.feature_grid}
                onChange={(v) => update("feature_grid", v)}
              />
            )}
            {selected === "product_stats" && (
              <StatsForm
                value={draft.product_stats}
                onChange={(v) => update("product_stats", v)}
              />
            )}
            {selected === "spec_table" && (
              <SpecTableForm
                value={draft.spec_table}
                onChange={(v) => update("spec_table", v)}
              />
            )}
            {selected === "assurance_bar" && (
              <AssuranceForm
                value={draft.assurance_bar}
                onChange={(v) => update("assurance_bar", v)}
              />
            )}
            {selected === "bundle_tiers" && (
              <BundleForm
                value={draft.bundle_tiers}
                onChange={(v) => update("bundle_tiers", v)}
              />
            )}
            {selected === "low_stock" && (
              <LowStockForm
                value={draft.low_stock}
                onChange={(v) => update("low_stock", v)}
              />
            )}
          </div>

          {/*
            Layout comes after the content, deliberately. A merchant choosing
            how it looks before deciding what it says is choosing in the dark —
            and the variants only differ in ways you can judge once there's
            something in them.
          */}
          <div className="mt-6 pt-5 border-t border-white/[0.05]">
            {/*
              Keyed off `entry.id` rather than `selected`: inside this branch
              `entry` is proven non-null, where `selected` is only known to be
              non-null to a reader. Writing through setDraft with a computed key
              also avoids asking the generic `update` to narrow a union it
              can't.
            */}
            <VariantPicker
              type={entry.id}
              value={draft[entry.id].variant}
              onChange={(variant) =>
                setDraft(
                  (d) => ({ ...d, [entry.id]: { ...d[entry.id], variant } }) as Draft,
                )
              }
            />
          </div>

          {missing.length > 0 && (
            <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-4 py-3">
              <p className="text-xs text-white/80">Still needed:</p>
              <ul className="mt-1.5 space-y-1">
                {missing.map((m) => (
                  <li key={m} className="text-xs text-destructive">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button onClick={submit} disabled={isPending} className="mt-5">
            {isPending ? "Saving…" : "Save & preview this block"}
          </Button>
        </Card>
      )}
    </div>
  );
}

// ── Per-type forms ──────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
      {children}
    </span>
  );
}

function TrustForm({
  value,
  onChange,
}: {
  value: Draft["trust_icons"];
  onChange: (v: Draft["trust_icons"]) => void;
}) {
  const set = (i: number, patch: Partial<(typeof value.items)[number]>) =>
    onChange({
      ...value,
      items: value.items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)),
    });

  return (
    <div className="space-y-4">
      {value.items.map((item, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end">
          <label>
            <FieldLabel>Icon</FieldLabel>
            <select
              value={item.icon}
              onChange={(e) => set(i, { icon: e.target.value })}
              className="w-full h-10 rounded-lg border border-white/10 bg-obsidian-950/60 px-3 text-sm text-white/80"
            >
              {TRUST_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon.replace("-", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <FieldLabel>What it says</FieldLabel>
            <Input
              value={item.label}
              onChange={(e) => set(i, { label: e.target.value })}
              placeholder="e.g. Free shipping over $50"
            />
          </label>
          <label>
            <FieldLabel>Detail (optional)</FieldLabel>
            <Input
              value={item.detail}
              onChange={(e) => set(i, { detail: e.target.value })}
              placeholder="e.g. Arrives in 3-5 days"
            />
          </label>
          <Button
            variant="ghost"
            onClick={() =>
              onChange({ ...value, items: value.items.filter((_, idx) => idx !== i) })
            }
            aria-label={`Remove item ${i + 1}`}
            className="h-10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          onChange({
            ...value,
            items: [...value.items, { icon: "returns", label: "", detail: "" }],
          })
        }
      >
        <Plus className="size-4" />
        Add another
      </Button>
    </div>
  );
}

function BrandForm({
  value,
  onChange,
}: {
  value: Draft["brand_cards"];
  onChange: (v: Draft["brand_cards"]) => void;
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <FieldLabel>Your promise, in one sentence</FieldLabel>
        <Input
          value={value.promise}
          onChange={(e) => onChange({ ...value, promise: e.target.value })}
          placeholder="e.g. Rings that outlive the trend cycle."
        />
      </label>
      <div>
        <FieldLabel>Three or four concrete benefits</FieldLabel>
        <div className="space-y-2">
          {value.benefits.map((benefit, i) => (
            <Input
              key={i}
              value={benefit}
              onChange={(e) =>
                onChange({
                  ...value,
                  benefits: value.benefits.map((b, idx) => (idx === i ? e.target.value : b)),
                })
              }
              placeholder={
                ["e.g. Solid brass, not plated", "e.g. Hand-finished in Lisbon", "e.g. Free resizing for life", ""][i] ??
                ""
              }
            />
          ))}
        </div>
        {value.benefits.length < 6 && (
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => onChange({ ...value, benefits: [...value.benefits, ""] })}
          >
            <Plus className="size-4" />
            Add a benefit
          </Button>
        )}
      </div>
      <label className="block">
        <FieldLabel>Logo URL (optional, https)</FieldLabel>
        <Input
          value={value.logoUrl ?? ""}
          onChange={(e) => onChange({ ...value, logoUrl: e.target.value || null })}
          placeholder="https://…"
          spellCheck={false}
        />
      </label>
    </div>
  );
}

function ComparisonForm({
  value,
  onChange,
}: {
  value: Draft["comparison"];
  onChange: (v: Draft["comparison"]) => void;
}) {
  const set = (i: number, patch: Partial<(typeof value.rows)[number]>) =>
    onChange({
      ...value,
      rows: value.rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    });

  return (
    <div className="space-y-4">
      <label className="block">
        <FieldLabel>What are you comparing against? (by name)</FieldLabel>
        <Input
          value={value.competitorName}
          onChange={(e) => onChange({ ...value, competitorName: e.target.value })}
          placeholder="e.g. Typical high-street ring"
        />
      </label>

      {value.rows.map((row, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end">
          <label>
            <FieldLabel>Row</FieldLabel>
            <Input
              value={row.label}
              onChange={(e) => set(i, { label: e.target.value })}
              placeholder="e.g. Price"
            />
          </label>
          <label>
            <FieldLabel>Yours</FieldLabel>
            <Input value={row.ours} onChange={(e) => set(i, { ours: e.target.value })} />
          </label>
          <label>
            <FieldLabel>Theirs</FieldLabel>
            <Input value={row.theirs} onChange={(e) => set(i, { theirs: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 h-10">
            <input
              type="checkbox"
              checked={row.weWin}
              onChange={(e) => set(i, { weWin: e.target.checked })}
              className="size-4"
            />
            <span className="text-xs text-white/60">We win</span>
          </label>
          <Button
            variant="ghost"
            onClick={() => onChange({ ...value, rows: value.rows.filter((_, idx) => idx !== i) })}
            aria-label={`Remove row ${i + 1}`}
            className="h-10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          onChange({
            ...value,
            rows: [...value.rows, { label: "", ours: "", theirs: "", weWin: true }],
          })
        }
      >
        <Plus className="size-4" />
        Add a row
      </Button>
    </div>
  );
}

function StatsForm({
  value,
  onChange,
}: {
  value: Draft["product_stats"];
  onChange: (v: Draft["product_stats"]) => void;
}) {
  const set = (i: number, patch: Partial<(typeof value.stats)[number]>) =>
    onChange({
      ...value,
      stats: value.stats.map((stat, idx) => (idx === i ? { ...stat, ...patch } : stat)),
    });

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40">
        Only numbers you can back up. If you don&apos;t have any, pick a
        different block — we won&apos;t invent figures for your storefront.
      </p>
      {value.stats.map((stat, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[1fr_8rem_6rem_auto] sm:items-end">
          <label>
            <FieldLabel>What it measures</FieldLabel>
            <Input
              value={stat.label}
              onChange={(e) => set(i, { label: e.target.value })}
              placeholder="e.g. Repeat buyers"
            />
          </label>
          <label>
            <FieldLabel>Number</FieldLabel>
            <Input
              value={stat.value}
              onChange={(e) => set(i, { value: e.target.value })}
              placeholder="38"
              inputMode="decimal"
            />
          </label>
          <label>
            <FieldLabel>Unit</FieldLabel>
            <Input
              value={stat.unit}
              onChange={(e) => set(i, { unit: e.target.value })}
              placeholder="%"
            />
          </label>
          <Button
            variant="ghost"
            onClick={() => onChange({ ...value, stats: value.stats.filter((_, idx) => idx !== i) })}
            aria-label={`Remove stat ${i + 1}`}
            className="h-10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          onChange({ ...value, stats: [...value.stats, { label: "", value: "", unit: "" }] })
        }
      >
        <Plus className="size-4" />
        Add a figure
      </Button>
    </div>
  );
}

/**
 * Feature grid — this PRODUCT's concrete features.
 *
 * The one-line cap is the pattern, not a safety margin: a grid where one card
 * runs to four lines stops being scannable and becomes an unread paragraph in a
 * box (design-references.md §3). The field says so rather than silently
 * refusing at save time.
 */
function FeatureForm({
  value,
  onChange,
}: {
  value: Draft["feature_grid"];
  onChange: (v: Draft["feature_grid"]) => void;
}) {
  const set = (i: number, patch: Partial<(typeof value.features)[number]>) =>
    onChange({
      ...value,
      features: value.features.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    });

  return (
    <div className="space-y-4">
      {value.features.map((feature, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[8rem_1fr_1.5fr_auto] sm:items-end">
          <label>
            <FieldLabel>Icon</FieldLabel>
            <select
              value={feature.icon}
              onChange={(e) => set(i, { icon: e.target.value })}
              className="w-full h-10 rounded-lg border border-white/10 bg-obsidian-950/60 px-3 text-sm text-white/80"
            >
              {TRUST_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon.replace("-", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <FieldLabel>Feature</FieldLabel>
            <Input
              value={feature.title}
              onChange={(e) => set(i, { title: e.target.value })}
              placeholder="Merino wool"
            />
          </label>
          <label>
            <FieldLabel>One line about it</FieldLabel>
            <Input
              value={feature.line}
              onChange={(e) => set(i, { line: e.target.value })}
              placeholder="Warm when it's cold, breathable when it isn't."
            />
          </label>
          {value.features.length > 2 && (
            <button
              type="button"
              aria-label={`Remove feature ${i + 1}`}
              onClick={() =>
                onChange({
                  ...value,
                  features: value.features.filter((_, idx) => idx !== i),
                })
              }
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-white/40 hover:text-destructive hover:bg-white/[0.04]"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      {value.features.length < 4 && (
        <Button
          variant="secondary"
          onClick={() =>
            onChange({
              ...value,
              features: [...value.features, { icon: "support", title: "", line: "" }],
            })
          }
        >
          <Plus className="size-4" />
          Add a feature
        </Button>
      )}
    </div>
  );
}

function SpecTableForm({
  value,
  onChange,
}: {
  value: Draft["spec_table"];
  onChange: (v: Draft["spec_table"]) => void;
}) {
  const set = (i: number, patch: Partial<(typeof value.rows)[number]>) =>
    onChange({
      ...value,
      rows: value.rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    });

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50">
        The fact a shopper leaves your page to go and look up. We don&apos;t pull
        these from Shopify — a weight we read off your catalogue isn&apos;t a spec
        you checked.
      </p>
      {value.rows.map((row, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <label>
            <FieldLabel>Spec</FieldLabel>
            <Input
              value={row.label}
              onChange={(e) => set(i, { label: e.target.value })}
              placeholder="e.g. Material"
            />
          </label>
          <label>
            <FieldLabel>Your answer</FieldLabel>
            <Input
              value={row.value}
              onChange={(e) => set(i, { value: e.target.value })}
              placeholder="e.g. Solid brass, rhodium plated"
            />
          </label>
          <Button
            variant="ghost"
            onClick={() => onChange({ ...value, rows: value.rows.filter((_, idx) => idx !== i) })}
            aria-label={`Remove spec ${i + 1}`}
            className="h-10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() => onChange({ ...value, rows: [...value.rows, { label: "", value: "" }] })}
      >
        <Plus className="size-4" />
        Add a spec
      </Button>
    </div>
  );
}

function AssuranceForm({
  value,
  onChange,
}: {
  value: Draft["assurance_bar"];
  onChange: (v: Draft["assurance_bar"]) => void;
}) {
  const set = (i: number, patch: Partial<(typeof value.items)[number]>) =>
    onChange({
      ...value,
      items: value.items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)),
    });

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50">
        One promise, or two. This strip sits under your buy button to remove the
        last objection — more than two and it starts competing with the button
        it&apos;s there to support.
      </p>
      {value.items.map((item, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[9rem_1fr_auto] sm:items-end">
          <label>
            <FieldLabel>Icon</FieldLabel>
            <select
              value={item.icon}
              onChange={(e) => set(i, { icon: e.target.value })}
              className="h-10 w-full rounded-lg border border-white/[0.08] bg-transparent px-3 text-sm text-white/90"
            >
              {TRUST_ICONS.map((ic) => (
                <option key={ic} value={ic} className="bg-neutral-900">
                  {ic}
                </option>
              ))}
            </select>
          </label>
          <label>
            <FieldLabel>What you promise</FieldLabel>
            <Input
              value={item.text}
              onChange={(e) => set(i, { text: e.target.value })}
              placeholder="e.g. 30-day money-back guarantee"
            />
          </label>
          <Button
            variant="ghost"
            onClick={() =>
              onChange({ ...value, items: value.items.filter((_, idx) => idx !== i) })
            }
            aria-label={`Remove promise ${i + 1}`}
            className="h-10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {value.items.length < 2 && (
        <Button
          variant="secondary"
          onClick={() =>
            onChange({ ...value, items: [...value.items, { icon: "shipping", text: "" }] })
          }
        >
          <Plus className="size-4" />
          Add a second promise
        </Button>
      )}
    </div>
  );
}

/**
 * The discount percentages, and nothing about money.
 *
 * The form asks for percentages rather than prices on purpose: a price typed
 * here would be frozen at the moment it was typed, and the merchant would find
 * out months after their next price change. The block computes the money from
 * `product.price` at render time in both modes.
 */
function BundleForm({
  value,
  onChange,
}: {
  value: Draft["bundle_tiers"];
  onChange: (v: Draft["bundle_tiers"]) => void;
}) {
  const set = (i: number, patch: Partial<(typeof value.tiers)[number]>) =>
    onChange({
      ...value,
      tiers: value.tiers.map((tier, idx) => (idx === i ? { ...tier, ...patch } : tier)),
    });

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50">
        Percentages only — the prices are worked out from your product every time
        the page renders, so they stay right when you change what it costs.
        Match your real discount rules: this block shows the maths, it
        doesn&apos;t apply the discount.
      </p>
      {value.tiers.map((tier, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[7rem_8rem_1fr_auto] sm:items-end">
          <label>
            <FieldLabel>Quantity</FieldLabel>
            <Input
              value={String(tier.quantity)}
              onChange={(e) => set(i, { quantity: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              inputMode="numeric"
              placeholder="2"
            />
          </label>
          <label>
            <FieldLabel>% off</FieldLabel>
            <Input
              value={String(tier.discountPercent)}
              onChange={(e) =>
                set(i, { discountPercent: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })
              }
              inputMode="decimal"
              placeholder="10"
            />
          </label>
          <label className="flex items-center gap-2 h-10">
            <input
              type="radio"
              name="ev-bundle-popular"
              checked={tier.highlight}
              onChange={() =>
                onChange({
                  ...value,
                  // Exactly one, enforced here as well as in the validator —
                  // two "most popular" ribbons is a claim contradicting itself.
                  tiers: value.tiers.map((t, idx) => ({ ...t, highlight: idx === i })),
                })
              }
              className="size-4"
            />
            <span className="text-xs text-white/70">Most popular</span>
          </label>
          <Button
            variant="ghost"
            onClick={() =>
              onChange({ ...value, tiers: value.tiers.filter((_, idx) => idx !== i) })
            }
            aria-label={`Remove tier ${i + 1}`}
            className="h-10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          onChange({
            ...value,
            tiers: [...value.tiers, { quantity: 0, discountPercent: 0, highlight: false }],
          })
        }
      >
        <Plus className="size-4" />
        Add a tier
      </Button>
    </div>
  );
}

function LowStockForm({
  value,
  onChange,
}: {
  value: Draft["low_stock"];
  onChange: (v: Draft["low_stock"]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50">
        We can&apos;t see your stock levels — the public product data Shopify
        gives us says whether something is available, not how many are left. So
        the block reads the real number from your theme when it runs, and the
        preview here shows your threshold as an example.
      </p>
      <label className="block max-w-[12rem]">
        <FieldLabel>Show it when stock drops to</FieldLabel>
        <Input
          value={String(value.threshold)}
          onChange={(e) =>
            onChange({ ...value, threshold: Number(e.target.value.replace(/\D/g, "")) || 0 })
          }
          inputMode="numeric"
          placeholder="5"
        />
      </label>
      <p className="text-xs text-white/40">
        If you don&apos;t track inventory on this product, the block renders
        nothing at all rather than guessing.
      </p>
    </div>
  );
}
