import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowLeft, Clock } from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { allPosts, getPost } from "@/lib/blog/posts";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found — EliteVault" };
  const url = `${baseUrl}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords ?? [post.keyword],
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      url,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const url = `${baseUrl}/blog/${post.slug}`;
  const related = allPosts()
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: post.author
      ? { "@type": "Person", name: post.author }
      : { "@type": "Organization", name: "EliteVault" },
    publisher: {
      "@type": "Organization",
      name: "EliteVault",
      logo: { "@type": "ImageObject", url: `${baseUrl}/icon.svg` },
    },
  };

  const faqJsonLd =
    post.faqs && post.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      <MarketingNav />
      <main className="container max-w-2xl pt-28 pb-24 md:pt-36">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-white/45 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="size-4" />
          All guides
        </Link>

        <article className="mt-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-white/35">
            {post.author && (
              <>
                <span>By {post.author}</span>
                <span className="text-white/15">·</span>
              </>
            )}
            <span>{fmtDate(post.date)}</span>
            <span className="text-white/15">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {post.readingMinutes} min read
            </span>
          </div>
          <h1 className="mt-3 font-serif text-3xl md:text-4xl tracking-tight leading-[1.12]">
            {post.h1}
          </h1>

          <div
            className="article-prose mt-8"
            dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
          />

          {post.faqs && post.faqs.length > 0 && (
            <section className="mt-12 border-t border-white/[0.06] pt-8">
              <h2 className="font-serif text-2xl tracking-tight">
                Frequently asked questions
              </h2>
              <div className="mt-4 space-y-5">
                {post.faqs.map((f) => (
                  <div key={f.q}>
                    <h3 className="text-sm font-medium text-white">{f.q}</h3>
                    <p className="mt-1 text-sm text-white/55 leading-relaxed">
                      {f.a}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>

        {/*
          Conversion CTA.

          Deliberately NOT a <h2>: it sits outside <article> and is boilerplate
          repeated on every post, so as a heading it injected "See exactly
          what's costing your store sales" into the document outline that
          search engines read as the article's topical structure. Rendered as a
          <p> with identical classes — same pixels, cleaner semantics. Same
          reasoning for "Keep reading" and the related-post titles below.
        */}
        <div className="mt-12 rounded-2xl border border-champagne-400/20 bg-champagne-400/[0.04] p-6 text-center">
          <p className="font-serif text-xl tracking-tight text-white">
            See exactly what&apos;s costing your store sales
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55 leading-relaxed">
            Run a free EliteVault audit — an annotated score of your homepage and
            a ranked punch-list of fixes, in under a minute.
          </p>
          <Link
            href="/sign-up?next=/app/analyzer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-champagne-400 px-5 py-2.5 text-sm font-medium text-obsidian-950 hover:bg-champagne-300 transition-colors"
          >
            Audit my store free
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-12">
            <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">
              Keep reading
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="group rounded-xl border border-white/[0.06] bg-card p-4 shadow-card transition-colors hover:border-white/[0.10]"
                >
                  <p className="font-serif text-base tracking-tight text-white">
                    {r.title}
                  </p>
                  <p className="mt-1.5 text-xs text-white/50 leading-relaxed">
                    {r.excerpt}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
