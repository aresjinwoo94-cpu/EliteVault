/**
 * PostHog events of the public audit page (/s/[slug]) — brief 2026-10 §2.7.
 * One place for the names so the page, the tests and the dashboards agree.
 *
 *   share_view            { share_slug, mode: "visitor" | "owner", stale, indexable }
 *   share_cta_click       { share_slug, position }   position = where on the page
 *   share_urlbox_submit   { share_slug, url }        the embedded "run the same audit" box
 *   share_claim_start     { share_slug }             owner starts claiming the audit   
 *   share_claim_done      { share_slug }             owner finished claiming it        
 *
 * `mode` is "owner" when the visitor holds a valid claim token (the owner's outreach link), else "visitor".
 */
export const SHARE_EVENTS = {
  view: "share_view",
  ctaClick: "share_cta_click",
  urlboxSubmit: "share_urlbox_submit",
  claimStart: "share_claim_start",
  claimDone: "share_claim_done",
} as const;

export type ShareMode = "visitor" | "owner";

/** Where a CTA sits on the page (the `position` property of share_cta_click). */
export type ShareCtaPosition =
  | "header"
  | "stale_banner"
  | "hero"
  | "locked_fixes"
  | "locked_persona"
  | "locked_scenarios"
  | "locked_library"
  | "owner_claim"
  | "footer";
