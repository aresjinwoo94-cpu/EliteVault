import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { allPosts } from "@/lib/blog/posts";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

export const metadata: Metadata = {
  title: "Blog — ecommerce CRO & conversion guides",
  description:
    "Practical guides on ecommerce conversion rate optimization, Shopify store audits, and what actually makes DTC stores convert — from the team behind EliteVault.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "EliteVault Blog — ecommerce CRO & conversion guides",
    description:
      "Practical, no-fluff guides on raising your store's conversion rate.",
    type: "website",
    url: `${baseUrl}/blog`,
  },
};

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BlogIndexPage() {
  const posts = allPosts();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "EliteVault Blog",
    url: `${baseUrl}/blog`,
    description:
      "Guides on ecommerce conversion rate optimization and Shopify store audits.",
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${baseUrl}/blog/${p.slug}`,
      datePublished: p.date,
      description: p.description,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav />
      <main className="container max-w-3xl pt-28 pb-24 md:pt-36">
        <p className="font-mono text-[10px] uppercase tracking-widest text-signal-300">
          Guides
        </p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-tight">
          Ecommerce CRO, without the fluff
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-white/55 leading-relaxed">
          Practical guides on raising your store&apos;s conversion rate — what
          actually moves the needle, how to diagnose what&apos;s costing you
          sales, and the benchmarks that matter.
        </p>

        <div className="mt-12 space-y-4">
          {posts.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="group block rounded-2xl border border-white/[0.06] bg-card p-6 shadow-card transition-colors hover:border-white/[0.10]"
            >
              <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-white/35">
                <span>{fmtDate(p.date)}</span>
                <span className="text-white/15">·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {p.readingMinutes} min read
                </span>
              </div>
              <h2 className="mt-2 font-serif text-2xl tracking-tight text-white group-hover:text-white">
                {p.title}
              </h2>
              <p className="mt-2 text-sm text-white/55 leading-relaxed">
                {p.excerpt}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-300">
                Read guide
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
