"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Lock,
  Search,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchLibrary, type WinningSiteCard } from "@/app/actions/search";
import { SiteCard } from "./site-card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PlanTier } from "@/lib/supabase/types";

export function LibraryView({
  initialItems,
  niches,
  savedIds: initialSavedIds,
  stats,
  plan,
}: {
  initialItems: WinningSiteCard[];
  niches: string[];
  savedIds: string[];
  stats: { total: number; niches: Record<string, number> };
  plan: PlanTier;
}) {
  const [items, setItems] = useState(initialItems);
  const [prompt, setPrompt] = useState("");
  const [niche, setNiche] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [detectedNiche, setDetectedNiche] = useState<string | null>(null);
  const [detectedKeywords, setDetectedKeywords] = useState<string[]>([]);
  const [tab, setTab] = useState<"all" | "saved">("all");
  const [savedIds] = useState(new Set(initialSavedIds));

  const isPaid = plan !== "free";

  function runSearch(opts: {
    prompt?: string;
    niche?: string | null;
    screenshotBase64?: string;
    mediaType?: "image/png" | "image/jpeg" | "image/webp";
  }) {
    startTransition(async () => {
      const res = await searchLibrary({
        prompt: opts.prompt,
        niche: opts.niche ?? undefined,
        screenshotBase64: opts.screenshotBase64,
        mediaType: opts.mediaType,
      });
      setItems(res.items);
      setAiUsed(res.ai);
      setDetectedNiche(res.detectedNiche ?? null);
      setDetectedKeywords(res.detectedKeywords ?? []);
    });
  }

  function onFile(file: File) {
    if (!isPaid) {
      toast.error("Image search is a Pro feature");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Max 6 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setScreenshotPreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const mediaType = (file.type || "image/png") as
        | "image/png"
        | "image/jpeg"
        | "image/webp";
      runSearch({ screenshotBase64: base64, mediaType, niche });
    };
    reader.readAsDataURL(file);
  }

  // Filter items for "Saved" tab
  const displayItems = useMemo(
    () =>
      tab === "saved" ? items.filter((it) => savedIds.has(it.id)) : items,
    [items, tab, savedIds],
  );

  const topNiches = useMemo(
    () =>
      Object.entries(stats.niches)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
    [stats.niches],
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-widest text-white/40">
            Library
          </span>
          <Badge variant="ai">
            <Sparkles className="size-3" />
            {stats.total} stores · AI-curated
          </Badge>
        </div>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">
          Stores that are{" "}
          <span className="italic text-gold-gradient">actually selling.</span>
        </h1>
        <p className="mt-2 text-sm text-white/55 max-w-2xl">
          {isPaid
            ? "Drop a screenshot of your own store and Gemini finds its closest converting siblings. Or search by prompt across all niches."
            : "Browse 9 hand-picked winners with full metrics. Upgrade to unlock 40+ more + AI image search + saved collections."}
        </p>
      </header>

      {/* Niche quick-filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => {
            setNiche(null);
            runSearch({ prompt, niche: null });
          }}
          className={cn(
            "text-xs px-3 py-1 rounded-full border transition-all",
            !niche
              ? "border-champagne-400/40 bg-champagne-400/10 text-champagne-200"
              : "border-white/[0.08] text-white/55 hover:text-white hover:border-white/20",
          )}
        >
          All <span className="ml-1 text-white/40 font-mono tabular-nums">{stats.total}</span>
        </button>
        {topNiches.map(([n, count]) => (
          <button
            key={n}
            onClick={() => {
              setNiche(n);
              runSearch({ prompt, niche: n });
            }}
            className={cn(
              "text-xs px-3 py-1 rounded-full border transition-all capitalize",
              niche === n
                ? "border-champagne-400/40 bg-champagne-400/10 text-champagne-200"
                : "border-white/[0.08] text-white/55 hover:text-white hover:border-white/20",
            )}
          >
            {n} <span className="ml-1 text-white/40 font-mono tabular-nums">{count}</span>
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-4 md:p-5 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/30 pointer-events-none" />
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch({ prompt, niche })}
              placeholder={
                isPaid
                  ? 'Try "minimal skincare with editorial type" or "subscription wellness brands"'
                  : "Search the 9 preview winners…"
              }
              className="pl-10 h-11"
            />
          </div>
          <Button
            onClick={() => runSearch({ prompt, niche })}
            disabled={isPending}
            className="md:w-32"
          >
            {isPending ? "Searching…" : "Search"}
          </Button>
        </div>

        {/* Image search */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {screenshotPreview ? (
            <div className="relative flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotPreview}
                alt="Search source"
                className="size-10 rounded-md object-cover"
              />
              <div className="text-xs">
                <p className="text-white/85">Searching by image</p>
                {detectedNiche ? (
                  <p className="text-white/40">
                    Detected niche:{" "}
                    <span className="text-champagne-300 capitalize">
                      {detectedNiche}
                    </span>{" "}
                    · {detectedKeywords.slice(0, 3).join(", ")}
                  </p>
                ) : (
                  <p className="text-white/40">Top matches first</p>
                )}
              </div>
              <button
                onClick={() => {
                  setScreenshotPreview(null);
                  setDetectedNiche(null);
                  setDetectedKeywords([]);
                  runSearch({ prompt, niche });
                }}
                className="ml-2 text-white/40 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <label
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs cursor-pointer transition-colors",
                !isPaid
                  ? "border-white/10 text-white/40 cursor-not-allowed"
                  : "border-white/15 text-white/70 hover:border-signal-500/40 hover:text-white",
              )}
            >
              {!isPaid ? (
                <Lock className="size-3" />
              ) : (
                <Upload className="size-3" />
              )}
              Drop a screenshot — Gemini finds visual matches
              {!isPaid && (
                <Badge variant="gold" className="ml-1">
                  Pro
                </Badge>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={!isPaid}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
          )}
          {aiUsed && (
            <Badge variant="ai" className="shrink-0">
              <Sparkles className="size-3" />
              Gemini re-ranked
            </Badge>
          )}
        </div>
      </div>

      {/* All / Saved tabs (Pro+) */}
      {isPaid && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "saved")}>
          <TabsList>
            <TabsTrigger value="all">All stores</TabsTrigger>
            <TabsTrigger value="saved">
              <Star className="size-3 mr-1" />
              Saved ({savedIds.size})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Grid */}
      <motion.div
        layout
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {displayItems.length === 0 ? (
          <div className="col-span-full text-center py-16 text-white/40">
            {tab === "saved"
              ? "No saved stores yet. Tap the ★ on any card to save."
              : "No matches. Try a different prompt."}
          </div>
        ) : (
          displayItems.map((s, i) => (
            <SiteCard
              key={s.id}
              site={s}
              index={i}
              canSave={isPaid}
              initialSaved={savedIds.has(s.id)}
            />
          ))
        )}
      </motion.div>

      {plan === "free" && (
        <div className="rounded-2xl border border-champagne-400/20 bg-gradient-to-br from-champagne-400/[0.05] to-signal-600/[0.05] p-6 text-center">
          <Lock className="mx-auto size-5 text-champagne-300" />
          <h3 className="mt-3 font-serif text-xl">
            9 winners on Free — {stats.total - 9}+ more on Pro
          </h3>
          <p className="mt-1 text-sm text-white/55 max-w-md mx-auto">
            Unlock metrics on every store, AI image-similarity search, and
            saved collections for $19/mo.
          </p>
          <Link href="/app/billing">
            <Button className="mt-4">Upgrade to Pro</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
