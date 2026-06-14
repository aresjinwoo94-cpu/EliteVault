import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    /** Subtle hover affordance for clickable cards (border brightens). */
    interactive?: boolean;
  }
>(({ className, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Hairline elevation recipe (Obsidian Quant v2): opaque obsidian
      // surface + 1px hairline + subtle inset shadow. No glass/blur on
      // plain cards — `.glass` is reserved for nav / overlays / mockups.
      "rounded-2xl border border-white/[0.06] bg-card shadow-card",
      interactive &&
        "transition-colors hover:border-white/[0.10]",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-6 pb-3", className)} {...props} />
);

export const CardTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={cn(
      "text-base font-medium tracking-tight text-white",
      className,
    )}
    {...props}
  />
);

export const CardDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn("text-sm text-white/50 leading-relaxed", className)}
    {...props}
  />
);

export const CardContent = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-6 pt-3", className)} {...props} />
);

export const CardFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
);
