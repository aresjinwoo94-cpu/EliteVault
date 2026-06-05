import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { ContactForm } from "@/components/support/contact-form";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Contact support",
  description: "Get in touch with the EliteVault team.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <div className="container max-w-2xl py-24 md:py-32">
          <Link
            href="/support"
            className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            Help center
          </Link>

          <h1 className="mt-4 font-serif text-3xl md:text-4xl tracking-tight">
            Contact support
          </h1>
          <p className="mt-2 text-sm text-white/55 leading-relaxed">
            Tell us what&apos;s going on and we&apos;ll reply by email. You can
            also reach us directly at{" "}
            <a
              href={`mailto:${COMPANY.contactEmail}`}
              className="text-champagne-400 hover:text-champagne-300"
            >
              {COMPANY.contactEmail}
            </a>
            .
          </p>

          <div className="mt-8">
            <ContactForm />
          </div>

          <p className="mt-6 flex items-center gap-2 text-xs text-white/35">
            <Mail className="size-3.5" />
            We never share your email. See our{" "}
            <Link href="/legal/privacy" className="underline hover:text-white/60">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
