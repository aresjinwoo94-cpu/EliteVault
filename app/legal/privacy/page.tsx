import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How EliteVault collects, uses, processes, and protects your data — including AI processing with Google Gemini.",
  alternates: { canonical: "/legal/privacy" },
};

const LAST_UPDATED = "October 2026";
const CONTACT = "support@elitevaultapp.com";

export default function PrivacyPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-widest text-white/40">Legal</p>
      <h1 className="mt-1 font-serif text-3xl md:text-4xl tracking-tight text-white">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-white/40">Last updated: {LAST_UPDATED}</p>

      <div className="legal-prose mt-8">
        <p>
          This Privacy Policy explains how <strong>Vital Living LLC</strong> (
          &ldquo;EliteVault&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects,
          uses, and protects your information when you use EliteVault. If you have
          any questions, contact us at{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>

        <h2>1. Who we are</h2>
        <p>
          EliteVault is an AI-powered ecommerce conversion-audit service operated
          by <strong>Vital Living LLC</strong>, established in{" "}
          <strong>New Mexico, United States</strong>. We are the data
          controller for the
          personal data described below.
        </p>

        <h2>2. Data we collect</h2>
        <ul>
          <li>
            <strong>Account data</strong> — your email address and, optionally,
            your name and avatar, handled through our authentication provider
            (Supabase). Passwords are never stored by us in plain text.
          </li>
          <li>
            <strong>Content you submit for analysis</strong> — the store URLs you
            audit and the screenshots captured or uploaded for those audits,
            which are stored in our hosted storage to render your results. Audits
            can also be run without an account; those are stored the same way
            (see sections 5 and 7).
          </li>
          <li>
            <strong>Support messages</strong> — questions you type in the help chat
            or send through the contact form. Chat questions are answered with the
            same AI provider described in section 5.
          </li>
          <li>
            <strong>Billing data</strong> — handled by Stripe. We store a Stripe
            customer reference and your plan/subscription status; we do{" "}
            <strong>not</strong> store your full card number.
          </li>
          <li>
            <strong>Technical &amp; usage data</strong> — device/browser
            information, IP address, and product analytics events used to operate
            and improve the service.
          </li>
        </ul>

        <h2>3. How we use your data</h2>
        <ul>
          <li>To provide the audits, scores, and other features you request.</li>
          <li>To process subscriptions, payments, and account management.</li>
          <li>To send transactional emails (receipts, billing notices, account and security messages).</li>
          <li>To maintain security, prevent abuse, and comply with legal obligations.</li>
          <li>To understand product usage and improve the service.</li>
        </ul>

        <h2>4. Legal basis</h2>
        <p>
          Where data-protection laws such as the GDPR or UK GDPR apply, we rely
          on: performance of a contract (to provide the audits and account you
          request); our legitimate interests (to secure, maintain and improve the
          service and prevent abuse); compliance with legal obligations (e.g. tax
          and accounting records); and your consent where the law requires it,
          which you can withdraw at any time.
        </p>
        <p>
          We do not currently show a cookie-consent banner. Our product analytics
          (PostHog, plus Vercel Web Analytics and Speed Insights) run on the basis
          of our legitimate interests in understanding and improving the service.
          PostHog honours your browser&apos;s Do Not Track setting, and you can ask
          us to exclude you from analytics at any time by emailing{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>

        <h2>5. AI processing</h2>
        <p>
          To produce an audit, the content you submit (the page URL and its
          screenshot) is processed by our AI provider,{" "}
          <strong>Google Gemini</strong>. We send only what is needed to generate
          your result.
        </p>
        <p>
          <strong>
            EliteVault does not train any AI model on your URLs, screenshots, or
            audits, and we never sell them.
          </strong>{" "}
          Your analyses are private to your account unless you create a share
          link. A share link opens a public, read-only page (score, summary,
          annotations and the screenshot) that anyone with the link can view and
          that search engines may index; we do not currently offer a self-serve
          way to turn a link off, so email us and we will remove it. Audits run
          without an account can only be opened from the browser session that
          started them, until you create an account to keep them.
        </p>
        <p>
          <strong>How Google uses this content.</strong> EliteVault currently
          runs on the Google Gemini API <strong>free tier</strong>. Under
          Google&apos;s free-tier terms, the content we send to generate your
          audit (the page URL and its screenshot) may be used by Google to
          improve its products and services, and human reviewers may read and
          annotate it. Google states that content submitted through its paid
          tier is not used for those purposes. Because of this, please do not
          run audits on pages containing confidential or personal information
          you would not want reviewed. If we move to Gemini&apos;s paid tier, we
          will update this section.
        </p>

        <h2>6. Service providers (sub-processors)</h2>
        <p>We rely on the following processors to operate EliteVault:</p>
        <ul>
          <li><strong>Stripe</strong> — payment processing and billing.</li>
          <li><strong>Google (Gemini)</strong> — AI processing of audits and of help-chat questions.</li>
          <li><strong>Google (Sign-In)</strong> — optional &ldquo;Continue with Google&rdquo; login.</li>
          <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
          <li><strong>Inngest</strong> — background job queue that runs audits (receives the audited URL and account/audit identifiers).</li>
          <li><strong>Resend</strong> — transactional email delivery.</li>
          <li><strong>Vercel</strong> — application hosting and delivery, plus Vercel Web Analytics and Speed Insights.</li>
          <li><strong>PostHog</strong> — product analytics.</li>
          <li>
            <strong>ScreenshotOne, Microlink, thum.io and WordPress mshots
            (Automattic)</strong> — website screenshot capture. They receive the
            public URL of the page to capture (not your account data); we use
            them as fallbacks for one another.
          </li>
        </ul>
        <p>
          Each processor handles data only as needed to provide its service to
          us, under its own terms and security commitments.
        </p>

        <h2>7. Data retention</h2>
        <p>
          <strong>Account data and audits:</strong> kept while your account is
          active, including the screenshots stored for those audits (a screenshot
          may also be reused to speed up a repeat audit of the same URL).{" "}
          <strong>Deletion:</strong> you can request deletion of your account and
          data at any time by emailing <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
          we complete it within 30 days (there is no self-serve deletion yet).{" "}
          <strong>Anonymous audits</strong> (run without an account): kept until
          deleted on request; they are not removed automatically.{" "}
          <strong>Shared audits:</strong> a share link stays public until we
          remove it on request.{" "}
          <strong>Billing records:</strong> kept as required by tax and accounting
          law (generally up to 7 years); card data is held by Stripe, not by us.{" "}
          <strong>Server and analytics logs:</strong> kept according to our
          providers&apos; standard retention.
        </p>

        <h2>8. International transfers</h2>
        <p>
          EliteVault is operated from the United States, and our providers may
          process data in the US and other countries. Where required, transfers
          rely on safeguards offered by those providers, such as the EU Standard
          Contractual Clauses or the EU-U.S. Data Privacy Framework where the
          provider is certified.
        </p>

        <h2>9. Your rights</h2>
        <p>
          Depending on your location, you may have the right to access, correct,
          delete, export, or restrict the processing of your personal data, and
          to object to certain processing. To exercise any of these rights,
          contact us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We respond
          within 30 days. If you are in the EU or UK, you can also complain to
          your local data-protection authority.
        </p>

        <h2>10. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. We will update the
          &ldquo;Last updated&rdquo; date above and, for material changes, take
          additional steps where required.
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions about privacy? Email{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </div>
    </>
  );
}
