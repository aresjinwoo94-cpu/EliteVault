"use client";

import { useState, useTransition } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { shareAnalysis } from "@/app/actions/share";
import { useT } from "@/components/i18n/locale-provider";

/**
 * P0.3 — turns a completed audit into a public, copy-able link
 * (/s/[slug]) with a dynamic OG card. Available on every plan (the share
 * page only exposes the free diagnosis). First click creates + copies the
 * link; subsequent clicks just re-copy.
 */
export function ShareButton({
  analysisId,
  initialSlug,
}: {
  analysisId: string;
  initialSlug?: string | null;
}) {
  const { t } = useT();
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("share.copied"), { description: url });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.message(t("share.yourLink"), { description: url });
    }
  }

  function onClick() {
    if (slug) {
      copy(`${window.location.origin}/s/${slug}`);
      return;
    }
    startTransition(async () => {
      const res = await shareAnalysis(analysisId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSlug(res.slug);
      copy(`${window.location.origin}/s/${res.slug}`);
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={isPending}
      className="shrink-0"
    >
      {copied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
      {isPending ? t("share.creating") : slug ? t("share.copyLink") : t("share.share")}
    </Button>
  );
}
