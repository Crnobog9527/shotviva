-- Yearly price change (Owner 2026-11-06, ARCHITECTURE §6.2): Starter / Pro yearly at 80% of
-- twelve months, Max yearly at 60%, rounded to whole dollars. Credits and days are unchanged,
-- so purchases settle exactly as before; price_usd only mirrors site.config.ts for support and
-- reporting (tests/db/credits.test.ts keeps the two equal). Stripe Prices are replaced by
-- scripts/stripe-setup.ts (new Price, lookup key transferred, old Price archived).
update public.products set price_usd = 191.00 where id = 'starter_yearly';
update public.products set price_usd = 479.00 where id = 'pro_yearly';
update public.products set price_usd = 713.00 where id = 'max_yearly';
