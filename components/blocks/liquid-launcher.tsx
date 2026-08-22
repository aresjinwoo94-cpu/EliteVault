"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBlocksProject } from "@/app/actions/blocks";

/**
 * Liquid Blocks WP-A — the single input the feature opens with.
 *
 * One field, on purpose. The gate behind it (SSRF → product page → Shopify) is
 * strict enough that most of the design work here is in how a rejection reads:
 * NOT_PRODUCT is the user's to fix and gets kept in the box with an example,
 * while NOT_SHOPIFY is our limit and must not be dressed up as their mistake.
 */
export function LiquidLauncher() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Paste your product page URL.");
      return;
    }
    startTransition(async () => {
      const res = await createBlocksProject({ url: trimmed });
      if (!res.ok) {
        // Long-form on purpose: these messages name the shape we want or the
        // limit we have, and a 2-second toast truncation would drop exactly the
        // half that tells the user what to do next.
        toast.error(res.error, { duration: 9000 });
        return;
      }
      router.push(`/app/liquid/${res.id}`);
    });
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-5 md:p-6">
      <Label htmlFor="liquid-url" className="text-sm text-white/70">
        Your product page URL
      </Label>
      <div className="mt-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/30" />
          <Input
            id="liquid-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isPending) submit();
            }}
            placeholder="yourstore.com/products/your-product-name"
            className="pl-9"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            disabled={isPending}
          />
        </div>
        <Button onClick={submit} disabled={isPending} className="shrink-0">
          {isPending ? "Reading your product…" : "Continue"}
          {!isPending && <ArrowRight className="size-4" />}
        </Button>
      </div>
      <p className="mt-3 text-xs text-white/40">
        A product page — not your homepage or a collection. We read the
        product&apos;s real title, price and images from your store, and measure
        your page&apos;s actual colours and type. Shopify only, for now.
      </p>
    </div>
  );
}
