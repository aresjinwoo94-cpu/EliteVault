"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-tight transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 select-none active:scale-[0.98] focus-visible:outline-none",
  {
    variants: {
      variant: {
        primary:
          "bg-champagne-400 text-obsidian-900 hover:bg-champagne-300 shadow-gold hover:shadow-gold-lg",
        secondary:
          "bg-white/[0.04] text-white hover:bg-white/[0.08] border border-white/10",
        ghost: "text-white/80 hover:bg-white/[0.06] hover:text-white",
        outline:
          "border border-white/15 bg-transparent text-white hover:bg-white/[0.04] hover:border-white/25",
        ai: "bg-gradient-to-br from-signal-500 to-signal-600 text-obsidian-950 shadow-signal hover:from-signal-400 hover:to-signal-500",
        destructive:
          "bg-destructive/90 text-white hover:bg-destructive shadow-[0_0_24px_-8px_rgba(239,68,68,0.5)]",
        link: "text-champagne-400 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-base font-semibold",
        icon: "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
