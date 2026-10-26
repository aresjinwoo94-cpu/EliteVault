"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { phCapture } from "@/lib/analytics/posthog";
import { SHARE_EVENTS, type ShareCtaPosition, type ShareMode } from "@/lib/analytics/share-events";

/** Fires `share_view` once per mount. Renders nothing. */
export function ShareViewTracker({
  slug,
  mode,
  stale,
  indexable,
}: {
  slug: string;
  mode: ShareMode;
  stale: boolean;
  indexable: boolean;
}) {
  useEffect(() => {
    phCapture(SHARE_EVENTS.view, { share_slug: slug, mode, stale, indexable });
  }, [slug, mode, stale, indexable]);
  return null;
}

/** An in-page link (to the audit box) that reports `share_cta_click` with its position. */
export function ShareCtaLink({
  slug,
  position,
  href = "#run-audit",
  className,
  children,
}: {
  slug: string;
  position: ShareCtaPosition;
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => phCapture(SHARE_EVENTS.ctaClick, { share_slug: slug, position })}
    >
      {children}
    </Link>
  );
}
