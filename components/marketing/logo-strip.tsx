"use client";

import { motion } from "framer-motion";

const LOGOS = [
  "Allbirds",
  "Gymshark",
  "Aesop",
  "Warby Parker",
  "Bombas",
  "Hims",
  "Glossier",
  "Casper",
  "Ridge",
  "OLIPOP",
];

export function LogoStrip() {
  return (
    <section className="py-16 border-y border-white/[0.04] bg-white/[0.01]">
      <div className="container">
        <p className="text-center text-xs uppercase tracking-widest text-white/40">
          Brands modeled in the vault
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-x-10 gap-y-4 opacity-70">
          {LOGOS.map((name, i) => (
            <motion.span
              key={name}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="font-serif text-xl text-white/45 hover:text-white/80 transition-colors"
            >
              {name}
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  );
}
