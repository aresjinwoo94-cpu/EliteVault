# Infra debt — migration drift, typecheck, branch hygiene

Companion to `chore/infra-debt`. Deliberately kept off the perf branch: nothing
here should be able to hold up a latency fix, and nothing there should be able
to hide behind a schema change.

---

## 1. Migration drift — what was actually found

The starting premise was "the schema in code ≠ the schema in prod, and nothing
validates it". Checking it produced a more precise, and less alarming, picture.

**The migrations were already idempotent.** All 29 files can be re-applied
safely. Enums are wrapped in `do $$ … exception when duplicate_object`, every
policy is preceded by `drop policy if exists` (or wrapped the same way), tables
and indexes use `if not exists`, functions use `or replace`. The one apparent
violation — `"Public read screenshots"` in 0002 — is guarded by the do-block
form rather than the drop form.

That's now enforced rather than assumed:
`scripts/tests/migrations-idempotent.test.ts` fails the build if a new
migration wouldn't survive a re-run. It's a static check over the `.sql` files,
so it needs no database and runs in the normal suite. It also has two tests
that check the checker itself, so a broken regex can't turn it into a
permanent pass.

**The documented "drift" in `lib/quota/guard.ts` was a misdiagnosis.** The
comment said production's `profiles` table lacks `current_period_start` because
migration 0001 "was never applied". 0001 defines `current_period_start` on
**`subscriptions`**, and never on `profiles` — so the original query was reading
a column off the wrong table. Selecting a column that doesn't exist errors the
whole query and makes the profile read null, which is what surfaced as the
spurious "Profile not found". The workaround (anchor the Meta-run window to the
1st of the UTC month) is correct on its own merits and is unchanged; only the
comment was wrong, and that mattered — it's the note that taught everyone to
distrust the migrations and start hand-casting types around them.

**What was genuinely missing was a record.** The runner replayed the whole
directory every time and wrote down nothing, so "is production on the schema
this code assumes?" was unanswerable. Two commands now answer it:

```bash
npm run db:migrate -- --status
```

```bash
npm run db:doctor
```

`--status` reads the new `public.schema_migrations` ledger and reports each
file as applied / pending / edited-after-apply (a checksum is stored, so
editing a migration after it ran is reported instead of silently skipped).

`db:doctor` is the stronger check and needs no ledger history: it parses the
`.sql` files for the tables and columns they define, reads `information_schema`
from the live database, and prints the difference. **It runs SELECTs only** — it
never writes and never applies anything. Run it after any deploy that carries a
migration.

### The runner now

| Command | Does |
|---|---|
| `npm run db:migrate` | applies only what the ledger hasn't recorded |
| `npm run db:migrate -- --status` | reports, changes nothing |
| `npm run db:migrate -- --dry-run` | lists what would run, changes nothing |
| `npm run db:migrate -- --all` | re-runs everything — **read the warning below** |
| `npm run db:migrate -- --mark-applied` | records everything WITHOUT running it |
| `npm run db:migrate -- <file.sql>` | applies one file |

### ⚠ Idempotent DDL is not idempotent DML

The idempotency test covers schema statements. It does **not** claim the data
statements are replayable, and at least one isn't. `0017_library_expansion.sql`
contains:

```sql
update public.winning_sites set status = 'published' where status = 'draft';
```

That was a no-op the day it was written — nothing was in draft. Today new
Library stores start as `draft` **on purpose**, pending verification, so
re-running it would publish every unverified store to users. A migration's DML
replays against *today's* data, not the data it was written for.

So `--all` is for a database you are certain is empty or fresh. To adopt the
ledger on an existing database, use `--mark-applied` — it records history
without executing it — and then prove the schema really matches with:

```bash
npm run db:doctor
```

`db:doctor` reads the live schema and doesn't trust the ledger at all, which is
what makes the recorded claim worth anything.

The ledger is a **record, not a lock**.

The runner now **stops at the first failure**. It used to continue, which was
survivable when it replayed everything every time — but migrations are ordered
and later ones assume earlier ones landed, so continuing past a failure gives
you a half-applied schema *and* a ledger that disagrees with it. A failed file
is never recorded, so re-running after a fix picks up exactly where it stopped.

One caveat worth knowing: "a failed migration is never recorded" rests on the
Management API returning a non-2xx for failed SQL. That holds for every failure
observed so far, but it hasn't been proven for every error shape. If a
migration ever appears applied but clearly isn't, `npm run db:doctor` is the
check that doesn't depend on the ledger at all.

## 2. Typecheck — where it stands and what unblocks it

`next.config.mjs` still has `typescript.ignoreBuildErrors: true` and
`eslint.ignoreDuringBuilds: true`. **Both stay on for now.** Flipping them with
errors outstanding turns the next deploy into a failed deploy, which is a worse
outcome than the debt.

Progress on this branch: **276 → 258 errors**, with `npm run build` and the
full test suite green, and no file gaining an error.

What was fixed is the part that doesn't need a database: the cookie-handling
callbacks in `lib/supabase/server.ts`, `lib/supabase/middleware.ts` and the auth
callback route (11 implicit `any`s in the code path that handles **sessions** —
the last place to want an untyped hole), the Chromium-only
`PasswordCredential` global, and a test import that couldn't resolve.

What's left is one root cause, and it's most of the file:

| Error | Count | Cause |
|---|---|---|
| TS2339 `Property … does not exist on type 'never'` | ~168 | `.from(...)` resolving to `never` |
| TS2345 `… not assignable to parameter of type 'never'` | ~42 | the same, on writes |
| everything else | ~48 | mixed, mostly downstream of the above |

`lib/supabase/types.ts` hand-writes a `Database` type that stops at migration
0001 while the schema is on 0031. Every table added since — `saved_sites`,
`community_analyses`, `screenshot_cache`, `usage_events`, `reviews`,
`growth_map_history` and the rest — is absent, so supabase-js resolves those
queries to `never` and the code papers over it with `as never` / `as any`.
**~210 of the 258 errors are that one gap.** Fixing it is not 210 fixes.

### Adoption sequence (the next session's job)

Do this on its own branch, and expect real errors to surface — some of the
`as never` casts are hiding genuine mismatches, which is the point.

1. **Generate the schema types.**
   ```bash
   npm run db:types
   ```
   Writes `lib/supabase/database.types.ts` from the live schema via the
   Management API — the same generator as `supabase gen types typescript`, but
   using the `SUPABASE_PAT` this repo already has, so there's no CLI to install
   or log into. It's a read-only GET. The file is generated: never hand-edit it.

2. **Run `npm run db:doctor` first, and fix any drift it reports.** Generating
   types from a drifted database bakes the drift into the types, which is worse
   than the current state because it looks authoritative.

3. **Wire it in.** In `lib/supabase/types.ts`, replace the hand-written
   `Database` with a re-export from `database.types.ts`. Keep everything else in
   that file — `AnalysisResult`, `BuyerPersona`, `PlanTier`, `Annotation`,
   `AUDIT_DIMENSION_LABELS` and friends are domain types no generator can
   produce, and they're imported all over the app.

4. **Delete the casts the gap forced, one file at a time.** `as never` on
   inserts/updates, `as any` on `.from(...)`, and the `Record<string, unknown>`
   row casts in the report pages. Highest-density files first:
   `app/actions/community.ts` (21), `inngest/functions/run-meta-simulation.ts`
   (21), `app/actions/search.ts` (13), `lib/api-auth.ts` (11).

5. **Only when `npm run typecheck` is genuinely green**, set
   `typescript.ignoreBuildErrors: false`. Then clean ESLint (2 errors today,
   both in `scripts/`, plus ~114 warnings) and set
   `eslint.ignoreDuringBuilds: false`.

Do not flip either flag early. A red build teaches people to bypass the build.

## 3. Branch hygiene (WP-7)

`main` is what Vercel deploys. Anything committed there is in production the
moment it's pushed — there is no staging step in between.

**The flow, minimally:**

1. Branch from `main` for every change: `feat/…`, `fix/…`, `perf/…`, `chore/…`.
2. Commit there. Never edit `main` directly.
3. `npm run typecheck`, `npm run test`, `npm run build` before opening the PR.
4. PR into `main`. Merge deploys.
5. If the change carries a migration: apply it (`npm run db:migrate`), then
   verify (`npm run db:doctor`). Prefer migrations that are fail-open so the
   order of deploy vs migrate can't break the app — see 0030/0031 on
   `perf/analyzer-latency` for the shape.

**Before starting new work**, make sure `git status` is clean. An uncommitted
working tree on `main` means nobody — including you — can tell what's actually
running in production, and it's how work gets lost. Commit it to a branch or
discard it deliberately; don't leave it sitting there.

The working tree was clean when this branch was cut, so nothing was at risk.
This section is the process that keeps it that way.
