import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  CHECKOUT_PAYMENT_METHOD_TYPES,
  type CheckoutPaymentMethodType,
} from "@/lib/stripe/payment-method-types";

/**
 * Accepted-payment brand marks, shared by the checkout trust row
 * (components/billing/payment-methods.tsx) and the marketing footer.
 *
 * Client-safe on purpose: no hooks, no server imports, no i18n lookup. The
 * footer is a client component and the checkout row is a server component, and
 * both render this same markup instead of each drawing its own SVG.
 *
 * The marks are hand-drawn wordmarks (inline SVG, `currentColor`) rather than
 * copies of the official brand logos — no external asset (nothing for a CSP to
 * block, nothing to fetch), no pixel-copy, and they inherit the dark theme
 * instead of fighting it. `textLength` + `lengthAdjust` pin each word to its
 * viewBox so the chip width is stable whatever font the browser resolves.
 *
 * Which brands show is NOT a hand-kept list: it is derived from the payment
 * methods Stripe Checkout is created with (lib/stripe/payment-method-types.ts),
 * so a brand can only appear while its method is actually enabled.
 */

export type PaymentMark =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "cashapp"
  | "amazonpay"
  | "link";

/** The brands each enabled Stripe payment method stands for. */
export const MARKS_BY_PAYMENT_METHOD_TYPE: Record<
  CheckoutPaymentMethodType,
  readonly PaymentMark[]
> = {
  card: ["visa", "mastercard", "amex", "discover"],
  amazon_pay: ["amazonpay"],
  cashapp: ["cashapp"],
  link: ["link"],
};

/** Left-to-right order of the chips; cards first, then wallets. */
const DISPLAY_ORDER: readonly PaymentMark[] = [
  "visa",
  "mastercard",
  "amex",
  "discover",
  "cashapp",
  "amazonpay",
  "link",
];

/** The brands to show: those backed by an enabled method, in display order. */
export const ACCEPTED_PAYMENT_MARKS: readonly PaymentMark[] = (() => {
  const enabled = new Set<PaymentMark>(
    CHECKOUT_PAYMENT_METHOD_TYPES.flatMap((t) => MARKS_BY_PAYMENT_METHOD_TYPE[t]),
  );
  return DISPLAY_ORDER.filter((m) => enabled.has(m));
})();

interface Wordmark {
  /** Full brand name — the accessible name for the chip. */
  label: string;
  /** What's drawn in the chip. */
  word: string;
  /** viewBox width; sets the chip's aspect ratio at a fixed height. */
  width: number;
  weight: number;
  /** Extra typographic character so the chips don't read as one font. */
  italic?: boolean;
  tracking?: number;
}

export const WORDMARKS: Record<PaymentMark, Wordmark> = {
  visa: {
    label: "Visa",
    word: "VISA",
    width: 40,
    weight: 800,
    italic: true,
    tracking: 0.5,
  },
  mastercard: {
    label: "Mastercard",
    word: "Mastercard",
    width: 66,
    weight: 700,
  },
  amex: {
    label: "American Express",
    word: "AMEX",
    width: 42,
    weight: 700,
    tracking: 0.8,
  },
  discover: {
    label: "Discover",
    word: "DISCOVER",
    width: 62,
    weight: 600,
    tracking: 0.6,
  },
  cashapp: { label: "Cash App Pay", word: "Cash App", width: 52, weight: 700 },
  amazonpay: { label: "Amazon Pay", word: "Amazon Pay", width: 62, weight: 700 },
  link: { label: "Link by Stripe", word: "Link", width: 26, weight: 700 },
};

export function BrandMark({ mark }: { mark: PaymentMark }) {
  const m = WORDMARKS[mark];
  return (
    <svg
      viewBox={`0 0 ${m.width} 14`}
      height={11}
      role="img"
      aria-label={m.label}
      className="block w-auto"
    >
      <title>{m.label}</title>
      <text
        x={m.width / 2}
        y={11}
        textAnchor="middle"
        textLength={m.width - 2}
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        fontSize={11}
        fontWeight={m.weight}
        fontStyle={m.italic ? "italic" : "normal"}
        letterSpacing={m.tracking ?? 0}
      >
        {m.word}
      </text>
    </svg>
  );
}

/** The row of accepted-brand chips. Wraps on narrow screens. */
export function PaymentMarks({
  className,
  chipClassName,
  ...aria
}: {
  className?: string;
  /** Extra classes for each chip (e.g. a quieter text colour in the footer). */
  chipClassName?: string;
} & Pick<HTMLAttributes<HTMLUListElement>, "aria-label" | "aria-labelledby">) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)} {...aria}>
      {ACCEPTED_PAYMENT_MARKS.map((mark) => (
        <li
          key={mark}
          className={cn(
            "inline-flex items-center rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-white/60",
            chipClassName,
          )}
        >
          <BrandMark mark={mark} />
        </li>
      ))}
    </ul>
  );
}
