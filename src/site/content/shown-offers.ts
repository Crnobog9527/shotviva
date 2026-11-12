import type { SiteProduct } from '@/core/config'

import { showsCredits, showsPrice } from './price-match'

// JSON-LD offers list only what the page itself shows (SEO launch handbook 03-S2: the offers'
// prices and credit counts match the page text one to one). A paid product counts as shown when
// the page's copy carries both its price ("$19.90") and its credit count ("1,990 credits",
// "1990 积分"). Both are needed: $49.90 is a Pro month and a large pack, and "990" sits inside
// "1,990". The copy is read as data, every string in the page object, so the JSON-LD can never
// list a plan the page drops or miss one it adds.

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) strings(item, out)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, out)
  return out
}

export function offersShownIn(page: unknown, products: readonly SiteProduct[]): SiteProduct[] {
  const text = strings(page).join('\n')
  return products.filter(
    (product) => product.priceUsd > 0 && showsPrice(text, product.priceUsd) && showsCredits(text, product.credits),
  )
}
