import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm text-white",
        "placeholder:text-white/30",
        "transition-colors duration-200",
        "focus:border-champagne-400/40 focus:bg-white/[0.05] focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
