# Liquid Blocks — design references

The source the catalogue's variants come from. Every variant in
`lib/blocks/variants.ts` cites an entry here; nothing in the catalogue is a
generic layout somebody invented at a keyboard.

**Why this file exists.** The product's claim is that a merchant can replace
several Shopify apps with one tool that emits native, scoped Liquid — no app
bloat, no monthly fee, no render-blocking JS. That claim only holds if the
blocks are as good as the apps they replace, which means modelling the patterns
those apps actually converge on rather than approximating them. When a variant
looks arbitrary, the answer should be findable here.

**How to use it.** Adding a variant starts with a reference: name the apps that
lead the category, write down the pattern they share, then build to that. A
variant with no entry here is a variant nobody can argue with.

---

## The interactivity rule

Every pattern below is tagged. This is the honesty line the whole feature rests
on, so it is recorded per-pattern rather than left to judgement:

- **`static`** — works completely as pure Liquid. No JS, no state, no cart
  logic. Everything the merchant sees in the preview is what their shopper gets.
- **`presentational`** — the market leaders in this category ship an
  *interactive* version. We ship the visual form only, and the catalogue says so
  in the merchant's own view before they choose it. We do not imitate the
  interactive part.
- **`deferred`** — genuinely needs JS and cart state. Not built, not faked,
  listed at the bottom with the cost it would carry.

A block that looks interactive and isn't is worse than no block: a shopper
clicks, nothing happens, and the merchant's page is now the thing that feels
broken. That reasoning is why §4 below ships as information rather than as a
selector.

---

## 1. Trust / benefit icons — `static`

**Category leaders:** Iconito · Trust Badges Bear · Essential Trust Badges &
Icons.

**The shared pattern.** A single row of 3–5 items, each an outline icon above or
beside a two-or-three-word label: free shipping, easy returns, secure checkout,
warranty. Restrained line-art rather than filled badges — the ones that convert
read as part of the theme, not as a sticker pasted on it. Placed directly under
the buy button, where the hesitation actually happens. On mobile the row becomes
a 2×2 grid rather than shrinking to illegibility.

**What makes it work:** it answers the objections a shopper has *at the moment
of clicking*, and it answers them in the store's own visual language. A badge
that looks imported from another site reduces trust instead of adding it — which
is exactly the failure our measured-token approach avoids.

**Variants built from this:** `row_line`, `boxed`, `stacked_2x2`.

---

## 2. Comparison "us vs them" — `static`

**Category leaders:** Us vs Them · Comparable · Bear Specs & Compare · Equate.

**The shared pattern.** Two or three columns — *Us* | *Them* | (*Others*) — with
benefit rows down the side. A ✓ in our column in the brand accent; a ✗ or an
em-dash in theirs, muted. Our column is lifted: a subtle tinted background and
an accent-coloured header, so the eye lands there first and the shape of the
answer is readable before a single row is read. Row labels are short benefit
phrases, not specifications.

**What makes it work:** it reframes the decision. A shopper comparing two tabs
is doing this comparison in their head anyway, badly and with worse information.
Doing it for them — visibly, with the competitor named — is the highest-leverage
static block on a product page, which is why it is built first.

**The honesty constraint:** the competitor is named BY THE MERCHANT and every
cell is their claim. We autofill nothing here. A comparison table generated from
invented facts is a legal problem, not a conversion feature.

**Variants built from this:** `two_col`, `three_col`, `checklist`.

---

## 3. Feature / benefit grid — `static`

**The shared pattern.** Two to four cards, each an icon in a soft accent-tinted
circle, a bold short title, and one line of explanation. Even spacing, equal
heights, no card competing for attention. Sits under the description where a
shopper is already reading rather than scanning.

**What makes it work:** it converts a wall of description text into three
scannable promises. The constraint that each card gets exactly one line is the
whole discipline — a grid where one card runs to four lines stops being a grid
and becomes an unread paragraph in a box.

**Distinct from Brand cards**, which tells the brand's story (a promise plus its
supporting benefits, optionally with a logo). This one is about the PRODUCT's
concrete features. They coexist deliberately; the gallery describes them
differently so a merchant picks by intent, not by looks.

**Variants built from this:** `cards_2`, `cards_3`, `cards_4`.

---

## 4. Bundle / volume pricing — `presentational`

**Category leaders:** Adoric · Fast Bundle · Kaching Bundles · VITALS.

**The pattern they ship.** Stacked tiers — buy 1 / buy 2 −10% / buy 3 −20% —
with a "MOST POPULAR" ribbon on the recommended tier, per-unit price beside the
total, a savings badge in the accent, and radio-style selection that adds the
chosen bundle to the cart.

**What we ship, and what we don't.** The tiers, the ribbon, the per-unit maths
and the savings badge — all calculated in Liquid from `product.price`, so they
stay correct when the merchant changes the price. **Not the selection.** The
version that adds to cart needs JS and cart logic, which is the bloat this
product exists to avoid.

Deliberately NOT rendered as radio buttons or anything else that looks clickable.
An earlier draft kept the radio affordance "for fidelity"; the owner rejected it,
correctly — a shopper who clicks a control that does nothing concludes the STORE
is broken, and the merchant pays for our fidelity with their trust. It ships as
an information panel: here is what volume costs. The catalogue labels it
"shows volume pricing; doesn't add to cart" before the merchant chooses it.

**Variants:** `stacked`, `side_by_side`. *(Phase 2.)*

---

## 5. Guarantee / delivery estimate — `static`

**The shared pattern.** One reassurance strip: a shield-or-lock icon with
"30-day money-back guarantee", or a truck with "Arrives in 3–5 days". Soft
tinted background, centred, full width, low contrast — it is a floor under the
decision, not a shout.

**What makes it work:** it removes the last objection without competing with the
buy button. The failure mode is making it loud enough to pull attention away
from the CTA it is supposed to support.

**Variants:** `single_strip`, `split_two`. *(Phase 2.)*

---

## 6. Specs / size table — `static`

**Category leader:** Bear Specs & Compare.

**The shared pattern.** A two-column key/value table — material, dimensions,
weight, care — with zebra striping or hairline dividers. A size chart is the
same table with responsive column headers. Dense on purpose: this block is for
the shopper who has already decided and is checking one fact before buying.

**What makes it work:** it prevents the tab-close. A shopper who cannot find a
dimension leaves to search for it and does not come back.

**Variants:** `zebra`, `divided`, `two_column`. *(Phase 2.)*

---

## 7. Low stock / scarcity — `static`, with a data caveat worth reading

**The shared pattern.** "Only 4 left" with a thin stock bar, in a warm accent.
Subtle — the versions that convert look like a status, and the versions that
backfire look like a threat.

**The caveat, and why the design changed because of it.** Shopify's public
`/products/<handle>.js` — the endpoint this feature measures from — returns
`available` as a boolean and does NOT expose `inventory_quantity`. So we cannot
know how many units are left, and a number we asked the merchant to type would
be a lie by the following morning.

The exported Liquid reads it live from the theme instead:
`{{ product.selected_or_first_available_variant.inventory_quantity }}`, guarded
by `inventory_management` so a store that doesn't track stock renders nothing at
all. The PREVIEW shows a clearly-labelled example, because we genuinely cannot
see the real figure from where we stand.

That trade is strictly better than the alternative: the number stays true
forever instead of being frozen at export time.

**Variants:** `bar`, `inline`. *(Phase 2.)*

---

## Deferred — needs JS and cart state

Not built, and not faked. Each would break the invariant the product is sold on:
additive Liquid, scoped to `.ev-blk`, no JavaScript.

| Pattern | What it needs | Why it's deferred |
|---|---|---|
| Variant swatches that change the selection | JS + variant state + price/image update | Duplicates what the theme already does, and doing it badly breaks add-to-cart |
| Sticky add-to-cart bar | JS scroll listener + cart form binding | Render-blocking listener on every scroll; the exact latency cost this product sells against |
| Bundles that add to cart | JS + Cart AJAX API + discount logic | Needs cart mutation and discount rules; a wrong implementation charges the wrong amount |
| Real countdown timer | JS interval + a persisted deadline | A countdown that resets on refresh is a lie a shopper can catch in one keypress |

If any of these is ever built, it belongs behind an explicit opt-in that states
its JS payload in kilobytes — the merchant chose this tool to escape exactly
that, and should have to agree to take it back on.

---

## System rules for every variant

- **Themed from measured tokens.** Accent drives ✓ marks, highlighted columns
  and CTAs; the store's own heading and body faces; measured radii and spacing.
  Never a colour, face or radius we chose — and where a token could not be
  measured, `fallbacks` says so and the merchant is asked.
- **Icons are inline SVG.** No icon font, no sprite sheet, no runtime request.
  A block that fetches anything is a block that can be slow or broken on someone
  else's storefront.
- **Scoped to `.ev-blk`.** Enforced mechanically by `selectorsOf` in
  `render-block.ts` and by `validateLiquidSnippet`, including against sibling
  combinators and `position:fixed`, which are scoped by the letter of the rule
  and escape it in practice.
- **Mobile-first.** Every variant states its narrow-viewport behaviour. A row
  that becomes unreadable at 375px is not a variant, it is a desktop layout with
  a bug.
- **No claim without the merchant's data.** Variants change LAYOUT only. No
  variant may introduce content, and none may make a block say more than the
  merchant typed.
