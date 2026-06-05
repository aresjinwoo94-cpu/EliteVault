/**
 * Single source of truth for company + founder identity.
 *
 * Resolves gap #9 (identity inconsistency): every public surface — the About
 * page, the Organization JSON-LD, the landing founder note, and (later)
 * emails/terms — reads from HERE, so the name is identical everywhere and
 * changes in one place.
 *
 * TODO(founder): decide the public identity ONCE and set it below.
 *   - Real name (most verifiable) or the "Marco A." pen name — but be
 *     consistent. We keep "Marco A." as the current public placeholder; the
 *     real founder is Ariel. Confirm before launch.
 *   - Fill `socials` with real profile URLs to power JSON-LD `sameAs` + the
 *     About page. Empty strings are filtered out so nothing fake is shown.
 *   - Replace [ENTIDAD LEGAL] / [JURISDICCIÓN] placeholders.
 */
export const COMPANY = {
  name: "EliteVault",
  tagline: "AI conversion audits for ecommerce founders",
  legalEntity: "[ENTIDAD LEGAL]",
  country: "[JURISDICCIÓN]",
  contactEmail: "support@elitevaultapp.com",

  founder: {
    name: "Marco A.", // TODO(founder): real name vs pen name — keep consistent
    role: "Founder, EliteVault",
    initials: "MA",
  },

  // Verifiable profiles. Fill with real URLs; empty values are ignored.
  socials: {
    linkedin: "", // e.g. https://www.linkedin.com/in/your-handle
    x: "", // e.g. https://x.com/your-handle
  },
};

/** Non-empty social profile URLs (for JSON-LD sameAs + the About page). */
export function socialUrls(): string[] {
  return Object.values(COMPANY.socials).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}
