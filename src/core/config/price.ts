import type { SiteConfig, SiteProduct } from './define-site'

// Shown wherever a price is not decided yet, so no page ever claims "$0" (建站规格 G3).
export const PRICE_PENDING = 'Price coming soon'

export function formatProductPrice(product: SiteProduct): string {
  if (product.priceUsd <= 0) return PRICE_PENDING
  return `$${product.priceUsd.toFixed(2)}`
}

// A dollar rate per 100 credits equals the full charge in cents divided by the credit grant.
export function usdPerHundredCredits(product: SiteProduct): number {
  return Math.round(product.priceUsd * 100) / product.credits
}

export function pricedProducts(site: SiteConfig): readonly SiteProduct[] {
  return site.billing.products.filter((product) => product.priceUsd > 0)
}
