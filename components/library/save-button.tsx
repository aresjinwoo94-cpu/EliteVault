"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { toggleSavedSite } from "@/app/actions/saved-sites";
import { cn } from "@/lib/utils";

/**
 * Star/save button. Optimistic UI — state flips immediately, server
 * action runs in the background. Errors revert the state + toast.
 */
export function SaveButton({
  siteId,
  initialSaved,
}: {
  siteId: string;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const prev = saved;
    setSaved(!prev);
    startTransition(async () => {
      const res = await toggleSavedSite(siteId);
      if (!res.ok) {
        setSaved(prev);
        toast.error(res.error);
        return;
      }
      if (res.saved && !prev) toast.success("Saved to your collection");
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={cn(
        "size-7 grid place-items-center rounded-md transition-all",
        saved
          ? "text-champagne-400 bg-champagne-400/10 hover:bg-champagne-400/20"
          : "text-white/40 hover:text-white hover:bg-white/[0.06]",
      )}
      aria-label={saved ? "Remove from saved" : "Save"}
    >
      <Star className={cn("size-3.5", saved && "fill-current")} />
    </button>
  );
}
