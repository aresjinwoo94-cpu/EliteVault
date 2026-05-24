-- Seed a few showcase winning sites so the Library doesn't look empty on first run.
-- The real curation will be done by the AI agent later.

insert into public.winning_sites (url, domain, title, description, niche, thumbnail_url, metrics, tags, is_featured)
values
('https://www.allbirds.com', 'allbirds.com', 'Allbirds', 'Sustainable wool sneakers — clean minimal e-com', 'footwear',
 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
 '{"ctr": 2.8, "roi": 3.4, "conv_rate": 4.1, "traffic_est": 980000}', '{footwear,sustainable}', true),

('https://www.gymshark.com', 'gymshark.com', 'Gymshark', 'Athleisure giant with savage ad creatives', 'fitness',
 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
 '{"ctr": 3.2, "roi": 5.1, "conv_rate": 3.8, "traffic_est": 4200000}', '{fitness,apparel}', true),

('https://www.aesop.com', 'aesop.com', 'Aesop', 'Editorial luxury skincare with rich typography', 'skincare',
 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800',
 '{"ctr": 1.9, "roi": 4.2, "conv_rate": 5.6, "traffic_est": 1700000}', '{skincare,luxury}', true),

('https://www.warbyparker.com', 'warbyparker.com', 'Warby Parker', 'D2C eyewear pioneer with frictionless try-on', 'eyewear',
 'https://images.unsplash.com/photo-1577803645773-f96470509666?w=800',
 '{"ctr": 2.4, "roi": 4.8, "conv_rate": 6.2, "traffic_est": 2100000}', '{eyewear,d2c}', false),

('https://www.bombas.com', 'bombas.com', 'Bombas', 'Performance socks brand crushing Meta ads', 'apparel',
 'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=800',
 '{"ctr": 3.6, "roi": 4.9, "conv_rate": 4.4, "traffic_est": 880000}', '{apparel,socks}', false),

('https://www.hims.com', 'hims.com', 'Hims', 'Men''s wellness — masterclass in funnel design', 'wellness',
 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=800',
 '{"ctr": 4.1, "roi": 5.8, "conv_rate": 7.9, "traffic_est": 3400000}', '{wellness,subscription}', true),

('https://www.glossier.com', 'glossier.com', 'Glossier', 'Beauty brand with cult community + UGC', 'beauty',
 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800',
 '{"ctr": 2.7, "roi": 3.9, "conv_rate": 5.1, "traffic_est": 2600000}', '{beauty,community}', false),

('https://www.casper.com', 'casper.com', 'Casper', 'Direct-to-consumer mattresses — bedrock CRO', 'home',
 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800',
 '{"ctr": 1.4, "roi": 2.1, "conv_rate": 2.9, "traffic_est": 1100000}', '{home,sleep}', false),

('https://www.ridge.com', 'ridge.com', 'Ridge Wallet', 'Minimalist wallet brand that conquered YouTube ads', 'accessories',
 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800',
 '{"ctr": 4.8, "roi": 6.4, "conv_rate": 5.9, "traffic_est": 1900000}', '{accessories,ev}', true),

('https://www.manscaped.com', 'manscaped.com', 'Manscaped', 'Grooming brand with unhinged but converting ads', 'grooming',
 'https://images.unsplash.com/photo-1583416750470-965b2707b355?w=800',
 '{"ctr": 5.2, "roi": 5.7, "conv_rate": 6.8, "traffic_est": 2800000}', '{grooming,viral}', false),

('https://www.olipop.com', 'olipop.com', 'OLIPOP', 'Prebiotic soda — vibrant DTC packaging story', 'beverage',
 'https://images.unsplash.com/photo-1543253687-c931c8e01820?w=800',
 '{"ctr": 3.4, "roi": 4.6, "conv_rate": 5.2, "traffic_est": 1400000}', '{beverage,health}', false),

('https://www.fashionnova.com', 'fashionnova.com', 'Fashion Nova', 'Fast-fashion with massive paid social spend', 'apparel',
 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800',
 '{"ctr": 2.1, "roi": 2.8, "conv_rate": 3.4, "traffic_est": 8800000}', '{apparel,fastfashion}', false)
on conflict (url) do nothing;
