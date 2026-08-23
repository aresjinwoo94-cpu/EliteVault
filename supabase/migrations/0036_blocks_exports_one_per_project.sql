-- ──────────────────────────────────────────────────────────────────────────
-- Liquid Blocks WP-D — make "you only pay once per project" a constraint.
--
-- It was only ever a READ. `startExportCheckout` checks for an existing paid
-- row before opening a Checkout Session, which is fine right up to the moment
-- two tabs are open: both render before either pays, both see `paid: false`,
-- both create a session, both get charged. The same happens if that read
-- transiently fails. `stripe_session_id` is unique, so the two rows have
-- different session ids and nothing stops them.
--
-- The code said charging twice "would be indefensible". This is what makes it
-- impossible rather than unlikely.
--
-- PARTIAL, on purpose: `pending` rows are traces of unfinished checkouts and
-- there can legitimately be several — someone who opens the payment form,
-- abandons it, and comes back. Only settled purchases are constrained.
--
-- lib/blocks/settle-export.ts handles the 23505 this can now raise by logging
-- everything needed to refund the second charge, and does NOT fail the webhook:
-- the export is already unlocked by the first row, and a 500 would only make
-- Stripe retry something that can never succeed.
--
-- Idempotent; rollback in
-- supabase/rollbacks/0036_blocks_exports_one_per_project_rollback.sql.
-- ──────────────────────────────────────────────────────────────────────────

create unique index if not exists blocks_exports_one_paid_per_project_idx
  on public.blocks_exports (project_id)
  where status = 'paid';
