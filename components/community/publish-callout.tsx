"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Globe, Share2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { publishAnalysis, unpublishAnalysis } from "@/app/actions/community";

/**
 * Prominent callout that lives ABOVE the analysis. Two states:
 *   • Not published yet  → gold gradient card with a big "Publish" CTA
 *   • Already published  → success-green card with "View public page" +
 *                          quiet "Unpublish" link
 *
 * Tuned to feel inviting without being pushy. Sits between the page
 * header and the score card so it's the first thing the user sees after
 * the audit completes — without competing with the score itself.
 */
export function PublishCallout({
  analysisId,
  defaultDisplayName,
  isPublished,
  publishedSlug,
}: {
  analysisId: string;
  defaultDisplayName?: string | null;
  isPublished: boolean;
  publishedSlug?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(defaultDisplayName ?? "");
  const [anonymize, setAnonymize] = useState(false);
  const [isPending, startTransition] = useTransition();

  function publish() {
    startTransition(async () => {
      const res = await publishAnalysis({
        analysisId,
        displayName: anonymize ? undefined : displayName || undefined,
        anonymize,
      });
      if (res.ok) {
        toast.success("Live in the Community");
        setOpen(false);
        router.push(`/app/community/${res.slug}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function unpublish() {
    if (!confirm("Remove this audit from the Community feed?")) return;
    startTransition(async () => {
      const res = await unpublishAnalysis(analysisId);
      if (res.ok) {
        toast.success("Removed");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not unpublish");
      }
    });
  }

  // ── PUBLISHED STATE ─────────────────────────────────────────────────
  if (isPublished) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-2xl border border-success/25 bg-success/[0.04] p-5 flex flex-col md:flex-row md:items-center gap-4"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/15 ring-1 ring-success/30">
          <CheckCircle2 className="size-5 text-success" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">
            This audit is live in the Community
          </p>
          <p className="text-xs text-white/55 mt-0.5">
            Other founders can read it, vote helpful and compare it side-by-side
            with theirs.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {publishedSlug && (
            <Link href={`/app/community/${publishedSlug}`}>
              <Button variant="primary" size="sm">
                <Globe className="size-3.5" />
                View public page
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          )}
          <button
            onClick={unpublish}
            disabled={isPending}
            className="text-xs text-white/40 hover:text-white/80 px-2 py-1 transition-colors"
          >
            Unpublish
          </button>
        </div>
      </motion.div>
    );
  }

  // ── UNPUBLISHED STATE ───────────────────────────────────────────────
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border border-champagne-400/25 bg-gradient-to-br from-champagne-400/[0.07] via-champagne-400/[0.02] to-violet-600/[0.05] p-5 md:p-6"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-champagne-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 -bottom-12 size-40 rounded-full bg-violet-600/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-champagne-400/15 ring-1 ring-champagne-400/30">
            <Share2 className="size-5 text-champagne-300" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-white tracking-tight">
                Publish this audit to the Community
              </h3>
              <Badge variant="ai">
                <Sparkles className="size-3" />
                Pro+
              </Badge>
            </div>
            <p className="mt-1 text-sm text-white/60 leading-relaxed">
              Share your audit with other founders. Build credibility, get
              compared, and watch what people say. <span className="text-white/40">Unpublish anytime in one click.</span>
            </p>
          </div>

          <Button
            onClick={() => setOpen(true)}
            size="lg"
            className="shrink-0 shadow-gold"
          >
            <Share2 className="size-4" />
            Publish to Community
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </motion.div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-champagne-400" />
              Publish this audit
            </DialogTitle>
            <DialogDescription>
              Anyone signed in to EliteVault will be able to view the score,
              annotations, persona response, scenarios and top fixes. You can
              unpublish anytime with one click.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name or brand"
                disabled={anonymize}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={anonymize}
                onChange={(e) => setAnonymize(e.target.checked)}
                className="size-4 rounded border-white/20 bg-white/[0.04]"
              />
              <span className="text-sm text-white/70">
                Publish anonymously (shown as "Anonymous founder")
              </span>
            </label>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-white/55 leading-relaxed">
              We publish the audit's <strong>score, annotations, persona
              response, scenarios, and summary</strong>. We DON'T publish your
              email, account info, or any data outside the audit itself.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={publish} disabled={isPending}>
              {isPending ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
