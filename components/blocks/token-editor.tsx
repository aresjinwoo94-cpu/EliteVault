"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveTokenOverrides } from "@/app/actions/blocks-compose";
import { requestBlocksPreview } from "@/app/actions/blocks-preview";
import type { DesignTokens } from "@/lib/blocks/design-tokens";

/**
 * Liquid Blocks WP-C — "we detected these; fix any we got wrong".
 *
 * This is the brief's answer to the failure mode that motivated the whole
 * feature: AI tools get the colour wrong. Measured against real storefronts,
 * we get the accent exactly right when the page exposes a buy button, and on
 * the ones that don't we can't read it at all. This screen is what turns that
 * second case from a silent guess into a question.
 *
 * So the interface leads with WHERE each value came from. A measured colour is
 * shown as fact; a guessed one is flagged and asks. Presenting them
 * identically would waste the honesty the token pipeline works to preserve.
 */

const COLOR_FIELDS = [
  { path: "palette.accent", label: "Button / accent colour", hint: "Read from your Add to cart button" },
  { path: "palette.pageBackground", label: "Page background", hint: "" },
  { path: "palette.surface", label: "Panel background", hint: "The block's own background" },
  { path: "palette.textPrimary", label: "Text", hint: "" },
  { path: "palette.accentText", label: "Text on the accent", hint: "" },
] as const;

const NUMBER_FIELDS = [
  { path: "shape.radiusPx", label: "Corner rounding", suffix: "px", min: 0, max: 32 },
  { path: "type.baseSizePx", label: "Base text size", suffix: "px", min: 10, max: 32 },
  { path: "shape.containerMaxWidthPx", label: "Content width", suffix: "px", min: 320, max: 2400 },
] as const;

function readToken(tokens: DesignTokens, path: string): string {
  const [group, key] = path.split(".");
  const bucket = (tokens as unknown as Record<string, Record<string, unknown>>)[group];
  return String(bucket?.[key] ?? "");
}

export function TokenEditor({
  projectId,
  tokens,
  savedOverrides,
  onSaved,
}: {
  projectId: string;
  tokens: DesignTokens;
  savedOverrides: Record<string, string>;
  /** Fired after a successful save so the parent can re-run the preview. */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(savedOverrides);
  const [isPending, startTransition] = useTransition();

  const unmeasured = new Set(tokens.fallbacks ?? []);
  const valueOf = (path: string) => draft[path] ?? readToken(tokens, path);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedOverrides);

  function save() {
    startTransition(async () => {
      const res = await saveTokenOverrides(projectId, draft);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      for (const w of res.warnings) toast.warning(w, { duration: 8000 });
      // Actually re-run it — see the same note in block-composer.tsx. A
      // correction the merchant can't see take effect is worse than no
      // correction at all, because it teaches them the control does nothing.
      const run = await requestBlocksPreview(projectId);
      if (!run.ok) {
        toast.error(run.error);
        return;
      }
      toast.success("Saved. Re-measuring your page with these values.");
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <Card className="p-5 border-white/[0.04]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white/70 flex items-center gap-2">
            <Pencil className="size-3.5 text-white/40" />
            Your store&apos;s design
          </h3>
          <p className="mt-1 text-xs text-white/40 max-w-xl">
            Read from your live product page. Anything marked below we
            couldn&apos;t read — correct it and the block uses your value instead
            of ours.
          </p>
        </div>
        {isDirty && (
          <Button onClick={save} disabled={isPending} className="shrink-0">
            {isPending ? "Saving…" : "Save & re-preview"}
          </Button>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COLOR_FIELDS.map((field) => {
          const guessed = unmeasured.has(field.path);
          const value = valueOf(field.path);
          return (
            <div key={field.path} className="min-w-0">
              <label
                htmlFor={`tok-${field.path}`}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40"
              >
                {field.label}
                {guessed ? (
                  <span className="inline-flex items-center gap-1 text-warning normal-case tracking-normal">
                    <AlertTriangle className="size-3" />
                    our guess
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-success normal-case tracking-normal">
                    <Check className="size-3" />
                    measured
                  </span>
                )}
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                {/*
                  A native colour input, because it's the one control every
                  browser and OS already knows how to do well — including on a
                  phone, where a bespoke picker would be the worst part of this
                  screen.
                */}
                <input
                  id={`tok-${field.path}`}
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [field.path]: e.target.value }))
                  }
                  className="size-9 shrink-0 rounded border border-white/15 bg-transparent p-0.5 cursor-pointer"
                  aria-label={field.label}
                />
                <Input
                  value={value}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [field.path]: e.target.value }))
                  }
                  spellCheck={false}
                  className="font-mono text-xs"
                />
              </div>
              {field.hint && !guessed && (
                <p className="mt-1 text-[11px] text-white/30">{field.hint}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {NUMBER_FIELDS.map((field) => (
          <div key={field.path} className="min-w-0">
            <label
              htmlFor={`tok-${field.path}`}
              className="text-[10px] uppercase tracking-widest text-white/40"
            >
              {field.label}
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id={`tok-${field.path}`}
                type="number"
                min={field.min}
                max={field.max}
                value={valueOf(field.path)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [field.path]: e.target.value }))
                }
                className="font-mono text-xs"
              />
              <span className="text-xs text-white/30 shrink-0">{field.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {(["type.headingFamily", "type.bodyFamily"] as const).map((path) => (
          <div key={path} className="min-w-0">
            <label
              htmlFor={`tok-${path}`}
              className="text-[10px] uppercase tracking-widest text-white/40"
            >
              {path === "type.headingFamily" ? "Heading font" : "Body font"}
            </label>
            <Input
              id={`tok-${path}`}
              value={valueOf(path)}
              onChange={(e) => setDraft((d) => ({ ...d, [path]: e.target.value }))}
              spellCheck={false}
              className="mt-1.5 font-mono text-xs"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
