import { Lock } from "lucide-react";
import { getT } from "@/lib/i18n/server";

/**
 * "Guaranteed safe checkout" trust row (checkout brief §2).
 *
 * This lives in OUR page chrome, OUTSIDE the cross-origin Stripe iframe — it
 * is purely a static badge row. It does not enable anything; the real list of
 * accepted methods is `payment_method_types` in
 * lib/stripe/checkout-session.ts (currently
 * ["card", "amazon_pay", "cashapp", "link"], where "card" covers Visa /
 * Mastercard / Amex / Discover / Diners / JCB). Keep the two in sync: never
 * advertise a brand here that Stripe won't actually offer.
 *
 * Left-aligned: it renders in the checkout's LEFT column alongside the plan
 * summary and the "cancel anytime" trust copy, not under the Stripe iframe.
 *
 * The marks are hand-drawn wordmarks (inline SVG, `currentColor`) rather than
 * copies of the official brand logos — no external asset, no pixel-copy, and
 * they inherit the dark theme instead of fighting it. `textLength` +
 * `lengthAdjust` pin each word to its viewBox so the chip width is stable
 * whatever font the browser resolves.
 */

/** Edit this list to add/remove a chip. Must stay a subset of what Stripe is
 *  actually configured to accept. */
const METHODS = [
  "visa",
  "mastercard",
  "amex",
  "discover",
  "cashapp",
  "amazonpay",
  "link",
] as const;

type Method = (typeof METHODS)[number];

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

const WORDMARKS: Record<Method, Wordmark> = {
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

function BrandMark({ method }: { method: Method }) {
  const m = WORDMARKS[method];
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

export async function PaymentMethods() {
  const { t } = await getT();
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/40">
        <Lock className="size-3" aria-hidden="true" />
        {t("checkout.safePayments")}
      </p>
      <ul className="mt-3 flex flex-wrap items-center gap-1.5">
        {METHODS.map((m) => (
          <li
            key={m}
            className="inline-flex items-center rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-white/60"
          >
            <BrandMark method={m} />
          </li>
        ))}
      </ul>
    </div>
  );
}
