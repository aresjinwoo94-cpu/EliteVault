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
import { useT } from "@/components/i18n/locale-provider";
import { Rich } from "@/components/i18n/rich";

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
  const { t } = useT();
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
        toast.success(t("community.publishedToast"));
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
        toast.success(t("community.removedFromToast"));
        router.refresh();
      } else {
        toast.error(res.error ?? t("community.unpublishFailed"));
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
            {t("community.viewPublic")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={unpublish}
          disabled={isPending}
        >
          {isPending ? t("community.removing") : t("community.unpublish")}
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Share2 className="size-3.5" />
          {t("community.publishCta")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-champagne-400" />
            {t("community.publishDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("community.publishDialogBody2")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">{t("community.displayName")}</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("community.namePlaceholder")}
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
              {t("community.anonLabel")}
            </span>
          </label>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-white/55 leading-relaxed">
            <Rich
                text={t("community.publishNotice")}
                tags={{ b: (c) => <strong>{c}</strong> }}
              />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={publish} disabled={isPending}>
            {isPending ? t("community.publishing") : t("community.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
