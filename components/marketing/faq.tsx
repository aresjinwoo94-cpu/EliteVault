"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQ_ITEMS = [
  {
    q: "How is this different from a heatmap or session-replay tool?",
    a: "Hotjar and Clarity show what users do — EliteVault explains why. We don't need traffic to give you an audit. Our AI reads design fundamentals (color, hierarchy, copy, CRO heuristics) and benchmarks them against stores actually scaling on paid social today.",
  },
  {
    q: "Where do the 'winning sites' in the Library come from?",
    a: "An agent continuously monitors paid social cohorts, Shopify trend signals, and growth communities. Every site is re-validated by the AI for traffic/engagement signals before it enters the Library. Stores that stop performing drop out automatically.",
  },
  {
    q: "Is the Analyzer accurate on small or new stores?",
    a: "Yes — accuracy comes from design-fundamentals scoring, not traffic data. We grade what's visible on the page. A pre-launch store can get a meaningful audit before it ever runs an ad.",
  },
  {
    q: "Can I cancel anytime?",
    a: "One click in the Stripe Customer Portal. No retention emails, no calls.",
  },
  {
    q: "Do my analyses train your AI?",
    a: "No. Your URLs, screenshots and audits are private to your account. We don't train models on customer data, and we don't share screenshots with third parties.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-24 md:py-32 border-t border-white/[0.04]">
      <div className="container max-w-3xl">
        <h2 className="text-center font-serif text-4xl md:text-5xl tracking-tight">
          Questions, answered.
        </h2>
        <div className="mt-12 space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <FAQItem key={i} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.06] bg-card/40 transition-colors",
        open && "border-white/[0.12]",
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-base font-medium">{q}</span>
        <ChevronDown
          className={cn(
            "size-4 text-white/40 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-white/55 leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
