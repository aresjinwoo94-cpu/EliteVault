import { ChevronDown } from "lucide-react";
import { FAQ_ITEMS } from "@/lib/content/faq";
import { getT } from "@/lib/i18n/server";

/**
 * Landing / pricing FAQ.
 *
 * A Server Component built on native <details>/<summary>: no client JS, no
 * framer-motion, no JS-driven height animation (animating `height: auto` from
 * script forced layout on every frame — the "lag opening the arrows" on
 * phones). Keyboard and screen-reader behaviour come from the platform; the
 * smooth open/close is pure CSS (`.faq-item::details-content` in globals.css,
 * progressive: browsers without it just open instantly).
 */
export async function FAQ() {
  const { t } = await getT();
  return (
    <section id="faq" className="section-y border-t border-white/[0.04]">
      <div className="container max-w-3xl">
        <h2 className="text-center font-serif text-4xl md:text-5xl tracking-tight">
          {t("faq.heading")}
        </h2>
        <div className="mt-12 space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={i}
              className="faq-item group glow-card rounded-xl border border-white/[0.06] bg-card/40 open:border-white/[0.12]"
            >
              <summary className="flex w-full cursor-pointer list-none items-center justify-between px-5 py-4 text-left [&::-webkit-details-marker]:hidden">
                <span className="font-serif text-base">
                  {t(`faqContent.q${i}`) || item.q}
                </span>
                <ChevronDown className="size-4 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-sm text-white/55 leading-relaxed">
                {t(`faqContent.a${i}`) || item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
