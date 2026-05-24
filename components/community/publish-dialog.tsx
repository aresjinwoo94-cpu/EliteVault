"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publishAnalysis, unpublishAnalysis } from "@/app/actions/community";

export function PublishDialog({
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
        toast.success("Published to Community!");
        setOpen(false);
        router.push(`/app/community/${res.slug}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function unpublish() {
    startTransition(async () => {
      const res = await unpublishAnalysis(analysisId);
      if (res.ok) {
        toast.success("Removed from Community");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not unpublish");
      }
    });
  }

  if (isPublished) {
    return (
      <div className="flex items-center gap-2">
        {publishedSlug && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/app/community/${publishedSlug}`)}
          >
            View public page
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={unpublish}
          disabled={isPending}
        >
          {isPending ? "Removing…" : "Unpublish"}
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Share2 className="size-3.5" />
          Publish to Community
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-champagne-400" />
            Publish this audit
          </DialogTitle>
          <DialogDescription>
            Anyone signed in to EliteVault will be able to view this audit
            (score, annotations, persona response, top fixes). You can
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
  );
}
