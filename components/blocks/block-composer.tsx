"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveBlockSpec } from "@/app/actions/blocks-compose";
import {
  BLOCK_CATALOG,
  TRUST_ICONS,
  type BlockSpecInput,
  type CatalogBlockType,
} from "@/lib/blocks/catalog";

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
  product_stats: Extract<BlockSpecInput, { type: "product_stats" }>;
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
  product_stats: { type: "product_stats", stats: [{ label: "", value: "", unit: "" }] },
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
      toast.success("Saved. Building the preview with your block.");
      onSaved?.();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-white/70">Choose a block</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {BLOCK_CATALOG.map((block) => {
            const active = selected === block.id;
            return (
              <button
                key={block.id}
                type="button"
                onClick={() => setSelected(block.id)}
                aria-pressed={active}
                className={
                  "text-left rounded-xl border p-4 transition-colors " +
                  (active
                    ? "border-champagne-400/40 bg-white/[0.05]"
                    : "border-white/[0.06] bg-card/30 hover:border-white/[0.14]")
                }
              >
                <p className="text-sm font-medium text-white/90">{block.name}</p>
                <p className="mt-1 text-xs text-white/45">{block.summary}</p>
              </button>
            );
          })}
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
            {selected === "product_stats" && (
              <StatsForm
                value={draft.product_stats}
                onChange={(v) => update("product_stats", v)}
              />
            )}
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
