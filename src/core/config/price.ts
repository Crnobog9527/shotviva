import type { SiteConfig, SiteProduct } from './define-site'

// Shown wherever a price is not decided yet, so no page ever claims "$0" (建站规格 G3).
export const PRICE_PENDING = 'Price coming soon'

export function formatProductPrice(product: SiteProduct): string {
  if (product.priceUsd <= 0) return PRICE_PENDING
  return `$${product.priceUsd.toFixed(2)}`
}

export function pricedProducts(site: SiteConfig): readonly SiteProduct[] {
  return site.billing.products.filter((product) => product.priceUsd > 0)
}

export function freeImagesLabel(site: SiteConfig): string {
  const n = site.billing.freeCredits
  return `${n} free ${n === 1 ? 'image' : 'images'}`
}
