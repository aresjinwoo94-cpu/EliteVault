"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Globe, Lock, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import posthog from "posthog-js";
import { createAnalysis } from "@/app/actions/analyzer";
import type { PlanTier } from "@/lib/supabase/types";
import { useT } from "@/components/i18n/locale-provider";

const PRESETS = [
  { id: "young-female", label: "launcher.pFemale", persona: { age: "22-30", gender: "female", country: "US", interests: ["fashion", "social media"] } },
  { id: "young-male", label: "launcher.pMale", persona: { age: "22-30", gender: "male", country: "US", interests: ["fitness", "tech"] } },
  { id: "mom-30s", label: "launcher.pMom", persona: { age: "30-40", gender: "female", country: "US/EU", interests: ["parenting", "wellness"] } },
  { id: "professional", label: "launcher.pPro", persona: { age: "28-45", country: "urban global", income_band: "high", interests: ["productivity", "luxury"] } },
  { id: "custom", label: "launcher.pCustom", persona: null },
];

export function AnalyzerLauncher({
  canRun,
  plan,
  initialUrl = "",
}: {
  canRun: boolean;
  plan: PlanTier;
  // P2.1 — prefilled from the landing-page URL box (carried through sign-up).
  initialUrl?: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [presetId, setPresetId] = useState("young-female");
  const [customNotes, setCustomNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const preset = PRESETS.find((p) => p.id === presetId)!;
  const isCustom = preset.id === "custom";

  function submit() {
    if (!url.trim()) {
      toast.error(t("launcher.enterUrl"));
      return;
    }
    startTransition(async () => {
      const persona =
        preset.persona ??
        (customNotes ? { notes: customNotes.slice(0, 380) } : undefined);
      const res = await createAnalysis({ url, persona: persona as any });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // We handed back an audit this user already had (duplicate submit, or
      // the same store again within the reuse window) — say so, otherwise the
      // instant result reads like a bug. No credit was charged.
      if (res.reused) {
        toast.success(t("launcher.openRecent"));
      }
      // PostHog: the activation event. Funnel = signup → analyzer_run →
      // checkout_started → plan_upgraded. The first three answer the
      // question "do users get value before being asked to pay?"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof window !== "undefined" && (posthog as any).__loaded) {
        posthog.capture("analyzer_run", {
          url: url.trim(),
          persona_preset: preset.id,
          plan,
        });
      }
      router.push(`/app/analyzer/${res.id}`);
    });
  }

  if (!canRun) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-champagne-400/20 bg-gradient-to-br from-champagne-400/[0.05] to-signal-600/[0.05] p-8 text-center">
        <Lock className="mx-auto size-7 text-champagne-300" />
        <h3 className="mt-4 font-serif text-2xl">
          {plan === "free"
            ? t("launcher.usedFree")
            : t("launcher.outOfCredits")}
        </h3>
        <p className="mt-2 text-sm text-white/55 max-w-md mx-auto">
          {plan === "free"
            ? t("launcher.upgradeBody")
            : t("launcher.topUp")}
        </p>
        <Button className="mt-5" onClick={() => router.push("/app/billing")}>
          {t("launcher.upgrade")}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative ai-border rounded-2xl"
    >
      <div className="rounded-2xl bg-obsidian-900/80 backdrop-blur-xl p-6 md:p-8 space-y-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-signal-600/15 ring-1 ring-signal-500/30">
            <Sparkles className="size-4 text-signal-300" />
          </div>
          <div>
            <h2 className="text-lg font-medium tracking-tight">
              {t("launcher.newAnalysis")}
            </h2>
            <p className="text-sm text-white/45">
              {t("launcher.cost")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="url">{t("launcher.storeUrl")}</Label>
          <div className="relative">
            <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/30 pointer-events-none" />
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourstore.com"
              className="pl-10 h-12 text-base"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            {t("launcher.persona")}
            <span className="ml-2 text-white/30 normal-case tracking-normal">
              {t("launcher.personaHint")}
            </span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPresetId(p.id)}
                className={`group flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition-all ${
                  presetId === p.id
                    ? "border-champagne-400/40 bg-champagne-400/10 text-champagne-200"
                    : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:text-white hover:border-white/20"
                }`}
              >
                <User className="size-3 opacity-60" />
                {t(p.label)}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {isCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Textarea
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder={t("launcher.customPlaceholder")}
                  rows={3}
                  className="mt-2"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            size="lg"
            onClick={submit}
            disabled={isPending}
            className="min-w-[180px]"
          >
            {isPending ? t("launcher.queueing") : t("launcher.analyze")}
            {!isPending && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
