"use client";

import { useState, useTransition } from "react";
import { ThumbsUp } from "lucide-react";
import { markHelpful } from "@/app/actions/community";
import { cn } from "@/lib/utils";

export function HelpfulButton({
  slug,
  count: initialCount,
}: {
  slug: string;
  count: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        if (voted || isPending) return;
        setCount((c) => c + 1);
        setVoted(true);
        startTransition(() => markHelpful(slug));
      }}
      className={cn(
        "flex items-center gap-1 transition-colors",
        voted ? "text-champagne-300" : "hover:text-white/80",
      )}
    >
      <ThumbsUp className={cn("size-3.5", voted && "fill-current")} />
      {count}
    </button>
  );
}
