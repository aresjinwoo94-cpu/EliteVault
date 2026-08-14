-- 0026b — Seed de teardowns (FASE A, costo cero)
-- Puebla `teardown` para unas pocas tiendas emblemáticas por dominio, para que
-- el valor sea visible ya sin generar 87 teardowns. El resto queda en NULL y la
-- UI degrada a "sin botón" (guardrail 7). Cada elemento se etiqueta con una de
-- las 6 dimensiones canónicas del Analyzer (AuditDimension) — NO inventar otras.
-- Idempotente vía `where domain ilike` + set directo (re-ejecutable).

update public.winning_sites
   set teardown = '{
     "summary": "Community-first branding and a clean, editorial product page turn browsers into repeat buyers.",
     "elements": [
       {"element":"Hero","dimension":"cro_principles","observation":"One benefit-led headline and a single primary CTA above the fold.","takeaway":"One CTA per screen. Lead with the outcome, not the product name."},
       {"element":"Product photography","dimension":"image_quality","observation":"Soft, real-skin imagery instead of sterile studio packshots.","takeaway":"Show the product in real use on real people, not just on white."},
       {"element":"Palette","dimension":"color_integration","observation":"A restrained two-color system (pink + white) held across every page.","takeaway":"Pick two brand colors and hold them everywhere. Restraint reads as premium."}
     ]
   }'::jsonb
 where domain ilike '%glossier%';

update public.winning_sites
   set teardown = '{
     "summary": "Athlete social proof and mobile-first speed convert cold ad traffic straight into checkout.",
     "elements": [
       {"element":"Hero","dimension":"cro_principles","observation":"Seasonal offer stated in the first line with one clear CTA.","takeaway":"State the offer in words, above the fold, before any scrolling."},
       {"element":"Athlete UGC","dimension":"niche_coherence","observation":"Real athletes in real training contexts, matched to the audience.","takeaway":"Use imagery your exact buyer recognizes as themselves, not stock models."},
       {"element":"Mobile layout","dimension":"layout_proportion","observation":"Thumb-reachable buttons and a single-column flow on phones.","takeaway":"Design the mobile column first; most paid traffic never sees desktop."}
     ]
   }'::jsonb
 where domain ilike '%gymshark%';

update public.winning_sites
   set teardown = '{
     "summary": "Radical material transparency plus a frictionless product page make first-time trust easy.",
     "elements": [
       {"element":"Product page","dimension":"layout_proportion","observation":"Price, sizing and Add to Cart visible without scrolling.","takeaway":"Keep price and the buy button in the first viewport on product pages."},
       {"element":"Sustainability story","dimension":"niche_coherence","observation":"Material sourcing explained in plain language the buyer cares about.","takeaway":"Translate what makes you different into a benefit your niche already values."},
       {"element":"Page speed","dimension":"technical_optimization","observation":"Lightweight pages that load fast even on mobile data.","takeaway":"Compress hero images and defer scripts. Speed is a conversion feature."}
     ]
   }'::jsonb
 where domain ilike '%allbirds%';

update public.winning_sites
   set teardown = '{
     "summary": "A bold color system and a soda-but-healthy frame sell an unfamiliar product fast.",
     "elements": [
       {"element":"Color system","dimension":"color_integration","observation":"High-contrast, flavor-coded palette that pops in ad thumbnails.","takeaway":"Make each variant instantly distinguishable by color, even at thumbnail size."},
       {"element":"Hero framing","dimension":"cro_principles","observation":"A one-line frame that anchors the product to a familiar category.","takeaway":"Anchor a new product to something the buyer already understands in one line."},
       {"element":"Comparison block","dimension":"niche_coherence","observation":"A side-by-side that positions it against regular soda on sugar.","takeaway":"Show the one comparison that makes the switch obvious for your niche."}
     ]
   }'::jsonb
 where domain ilike '%olipop%';

update public.winning_sites
   set teardown = '{
     "summary": "A one-for-one mission plus obsessive comfort proof turns a boring product into a repeat purchase.",
     "elements": [
       {"element":"Mission banner","dimension":"niche_coherence","observation":"The donate-a-pair promise is stated up front, not buried.","takeaway":"Lead with the one reason your buyer feels good buying, not just specs."},
       {"element":"Comfort proof","dimension":"cro_principles","observation":"Specific comfort features listed right next to the buy button.","takeaway":"Put your top 3 differentiators beside Add to Cart, never in the footer."},
       {"element":"Product imagery","dimension":"image_quality","observation":"Close-up texture shots that sell how the product feels.","takeaway":"For tactile products, show macro texture — let the buyer almost feel it."}
     ]
   }'::jsonb
 where domain ilike '%bombas%';

update public.winning_sites
   set teardown = '{
     "summary": "Heavy-metal branding and a crystal-clear offer make canned water impulse-buyable.",
     "elements": [
       {"element":"Brand voice","dimension":"niche_coherence","observation":"Irreverent copy that fully owns a distinct lane.","takeaway":"A sharp, consistent voice beats a neutral one — pick a lane and commit."},
       {"element":"Packaging design","dimension":"color_integration","observation":"High-contrast black cans engineered to stand out on a shelf.","takeaway":"Design for the shelf and the thumbnail — contrast wins the first glance."},
       {"element":"Hero","dimension":"cro_principles","observation":"One product, one CTA, no competing choices.","takeaway":"One product, one CTA. Remove every choice that is not the purchase."}
     ]
   }'::jsonb
 where domain ilike '%liquiddeath%';
