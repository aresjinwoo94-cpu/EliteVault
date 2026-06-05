import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How EliteVault collects, uses, processes, and protects your data — including AI processing with Google Gemini.",
};

const LAST_UPDATED = "June 2026";
const CONTACT = "support@elitevaultapp.com";

export default function PrivacyPage() {
  return (
    <>
      {/* TODO: revisión legal profesional antes de producción */}
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
            which are stored in our hosted storage to render your results.
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
          Where applicable (e.g. under the GDPR), we process personal data to
          perform our contract with you, on the basis of our legitimate interests
          in operating and securing the service, to comply with legal
          obligations, and—where required—with your consent.{" "}
          <strong>[Confirmar bases legales con asesoría según jurisdicción.]</strong>
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
            We do not use your URLs, screenshots, or audits to train AI models,
            and we do not sell or share your screenshots with third parties for
            their own purposes.
          </strong>{" "}
          Your analyses are private to your account.
        </p>

        <h2>6. Service providers (sub-processors)</h2>
        <p>We rely on the following processors to operate EliteVault:</p>
        <ul>
          <li><strong>Stripe</strong> — payment processing and billing.</li>
          <li><strong>Google (Gemini)</strong> — AI processing of audits.</li>
          <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
          <li><strong>Resend</strong> — transactional email delivery.</li>
          <li><strong>Vercel</strong> — application hosting and delivery.</li>
          <li><strong>PostHog</strong> — product analytics.</li>
          <li><strong>ScreenshotOne</strong> — website screenshot capture (when used).</li>
        </ul>
        <p>
          Each processor handles data only as needed to provide its service to
          us, under its own terms and security commitments.
        </p>

        <h2>7. Data retention</h2>
        <p>
          We keep your account and audit data for as long as your account is
          active. When you delete your account, we delete or anonymize your
          personal data within a reasonable period, except where we must retain
          certain records (e.g. billing) to meet legal obligations.{" "}
          <strong>[Definir periodos de retención concretos con asesoría.]</strong>
        </p>

        <h2>8. International transfers</h2>
        <p>
          Our providers may process data in countries other than yours. Where
          required, such transfers are covered by appropriate safeguards.{" "}
          <strong>[Confirmar mecanismos de transferencia según jurisdicción.]</strong>
        </p>

        <h2>9. Your rights</h2>
        <p>
          Depending on your location, you may have the right to access, correct,
          delete, export, or restrict the processing of your personal data, and
          to object to certain processing. To exercise any of these rights,
          contact us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
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
