import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white",
      "placeholder:text-white/30",
      "transition-colors duration-200 resize-none",
      "focus:border-champagne-400/40 focus:bg-white/[0.05] focus:outline-none",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
