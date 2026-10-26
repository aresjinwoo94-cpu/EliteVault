"use client";

import { phCapture } from "@/lib/analytics/posthog";
import { AnonAuditBox } from "@/components/marketing/anon-audit-box";
import { SHARE_EVENTS } from "@/lib/analytics/share-events";

/**
 * The embedded "run the same audit on your store" box. It is the EXISTING anonymous flow (AnonAuditBox →
 * createAnonAnalysis): same one-attempt quota, same anti-bot and blocked-store handling, enforced server-side.
 * This wrapper only adds the `share_urlbox_submit` event and the attribution source.
 */
export function ShareAuditBox({ slug, label, caption }: { slug: string; label: string; caption: string }) {
  return (
    <AnonAuditBox
      source="share_page"
      ctaLabel={label}
      caption={caption}
      align="left"
      onSubmitUrl={(url) => phCapture(SHARE_EVENTS.urlboxSubmit, { share_slug: slug, url })}
    />
  );
}
