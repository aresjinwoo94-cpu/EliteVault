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

export function ReportButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (reason.trim().length < 3) {
      toast.error("Please add a short reason");
      return;
    }
    startTransition(async () => {
      const res = await reportCommunityAnalysis({ slug, reason });
      if (res.ok) {
        toast.success("Reported — our team will review");
        setOpen(false);
        setReason("");
      } else {
        toast.error(res.error ?? "Could not submit report");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 hover:text-white/80 transition-colors">
          <Flag className="size-3.5" />
          Report
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this audit</DialogTitle>
          <DialogDescription>
            Help us moderate the feed. Reports are reviewed by humans. After 3
            verified reports the audit is auto-hidden.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What's wrong with this audit? E.g. defamatory claims, my brand without consent, factually wrong, spam…"
          rows={5}
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={isPending}
          >
            {isPending ? "Submitting…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
