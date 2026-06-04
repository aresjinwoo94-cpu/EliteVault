import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms governing your use of EliteVault, including the nature of AI estimates, acceptable use, and liability.",
};

const LAST_UPDATED = "June 2026";
const CONTACT = "support@elitevaultapp.com";

export default function TermsPage() {
  return (
    <>
      {/* TODO: revisión legal profesional antes de producción */}
      <p className="text-xs uppercase tracking-widest text-white/40">Legal</p>
      <h1 className="mt-1 font-serif text-3xl md:text-4xl tracking-tight text-white">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-white/40">Last updated: {LAST_UPDATED}</p>

      <div className="legal-prose mt-8">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of
          EliteVault, operated by <strong>[ENTIDAD LEGAL]</strong> (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;). By creating an account or using the service, you agree
          to these Terms. If you do not agree, do not use the service.
        </p>

        <h2>1. The service</h2>
        <p>
          EliteVault provides AI-generated conversion audits, a library of example
          stores, persona simulations, campaign scenario modeling, and related
          tools for ecommerce. Features available to you depend on your plan.
        </p>

        <h2>2. Your account</h2>
        <p>
          You are responsible for the activity under your account and for keeping
          your credentials and API keys secure. You must provide accurate
          information and be old enough to form a binding contract in your
          jurisdiction.
        </p>

        <h2>3. Subscriptions, billing &amp; cancellation</h2>
        <p>
          Paid plans are billed in advance on a recurring basis through Stripe and
          renew automatically until cancelled. You can cancel at any time from the
          Stripe Customer Portal; see our{" "}
          <a href="/legal/refunds">Refund &amp; Cancellation Policy</a> for how
          cancellation, access periods, and refunds work.
        </p>

        <h2>4. AI output is an estimate, not a guarantee</h2>
        <p>
          EliteVault&apos;s scores, prioritized fixes, buyer-persona simulations,
          conversion-rate scenarios, and Meta Ads projections are{" "}
          <strong>directional estimates produced by AI</strong> based on
          design fundamentals and general market knowledge.{" "}
          <strong>
            They are not predictions, financial advice, or guarantees of any
            specific outcome, revenue, or advertising result.
          </strong>{" "}
          You are solely responsible for decisions you make based on them.
        </p>

        <h2>5. Content you submit &amp; third-party data</h2>
        <p>
          When you submit a URL or screenshot for analysis, you represent that you
          have the right to do so and that doing so does not violate any law or
          third party&apos;s rights. You must not use EliteVault to process
          content that is unlawful, infringing, or that you are not authorized to
          analyze.
        </p>

        <h2>6. Acceptable use &amp; the API</h2>
        <p>
          You agree not to misuse the service, including: reselling or
          redistributing outputs as your own automated service without
          authorization, circumventing usage limits, scraping the platform, or
          attempting to disrupt it. API access (where included in your plan) is
          authenticated with bearer tokens, is subject to your plan&apos;s usage
          limits, and must not be shared. We may suspend access for abuse.
        </p>

        <h2>7. Intellectual property</h2>
        <p>
          We own the EliteVault software, brand, and content. You own the content
          you submit; you grant us the limited license needed to process it and
          deliver your results. The outputs generated for your account are yours
          to use for your business.
        </p>

        <h2>8. Disclaimer of warranties</h2>
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;, without warranties of any kind to the maximum extent
          permitted by law. We do not warrant that the service will be
          uninterrupted, error-free, or that any result will be achieved.
        </p>

        <h2>9. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, EliteVault and{" "}
          <strong>[ENTIDAD LEGAL]</strong> will not be liable for any indirect,
          incidental, or consequential damages, or for lost profits or revenue,
          arising from your use of the service. Our total liability for any claim
          is limited to the amount you paid us in the 12 months before the claim.{" "}
          <strong>[Confirmar límites con asesoría según jurisdicción.]</strong>
        </p>

        <h2>10. Termination</h2>
        <p>
          You may stop using the service at any time. We may suspend or terminate
          accounts that violate these Terms. On termination, your right to use the
          service ends; sections that by their nature should survive will survive.
        </p>

        <h2>11. Governing law</h2>
        <p>
          These Terms are governed by the laws of{" "}
          <strong>[JURISDICCIÓN]</strong>, without regard to conflict-of-law
          rules. <strong>[Confirmar fuero y ley aplicable con asesoría.]</strong>
        </p>

        <h2>12. Changes</h2>
        <p>
          We may update these Terms. We will update the &ldquo;Last updated&rdquo;
          date and, for material changes, take additional steps where required.
          Continued use after changes means you accept them.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions about these Terms? Email{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </div>
    </>
  );
}
