"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { reportCommunityAnalysis } from "@/app/actions/community";
import { useT } from "@/components/i18n/locale-provider";

export function ReportButton({ slug }: { slug: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (reason.trim().length < 3) {
      toast.error(t("community.reportReason"));
      return;
    }
    startTransition(async () => {
      const res = await reportCommunityAnalysis({ slug, reason });
      if (res.ok) {
        toast.success(t("community.reportedToast"));
        setOpen(false);
        setReason("");
      } else {
        toast.error(res.error ?? t("community.reportFailed"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 hover:text-white/80 transition-colors">
          <Flag className="size-3.5" />
          {t("community.report")}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("community.reportTitle")}</DialogTitle>
          <DialogDescription>
            {t("community.reportBody")}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("community.reportPlaceholder")}
          rows={5}
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={isPending}
          >
            {isPending ? t("community.submitting") : t("community.submitReport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
