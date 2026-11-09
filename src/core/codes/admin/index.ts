import type { SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { discountedPriceCents } from '../index'

export type CatalogInput = Pick<SiteProduct, 'id' | 'priceUsd' | 'credits' | 'tier'>
export type CodeProduct = { id: SiteProduct['id']; priceCents: number; credits: number; subscription: boolean }

function codeProduct(product: CatalogInput): CodeProduct {
  // Convert the configured USD to a whole minor unit. The round trip accepts ordinary JS
  // decimals such as 19.99 but rejects sub-cent prices instead of silently changing them.
  const priceCents = Math.round(product.priceUsd * 100)
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0 || priceCents / 100 !== product.priceUsd
    || !Number.isInteger(product.credits) || product.credits <= 0 || product.credits > 2_147_483_647) {
    throw new AppError('INTERNAL', 'Invalid campaign product economics')
  }
  return { id: product.id, priceCents, credits: product.credits, subscription: product.tier !== 'pack' }
}

function compareUnitPrice(a: CodeProduct, b: CodeProduct): bigint {
  return BigInt(a.priceCents) * BigInt(b.credits) - BigInt(b.priceCents) * BigInt(a.credits)
}

export function campaignCatalog(products: readonly CatalogInput[]) {
  const catalog = products.map(codeProduct)
  if (new Set(catalog.map(product => product.id)).size !== catalog.length) {
    throw new AppError('INTERNAL', 'Duplicate campaign product ID')
  }
  const subscriptions = catalog.filter(product => product.subscription)
  if (!subscriptions.length) throw new AppError('INTERNAL', 'Missing subscription in campaign catalog')
  const floor = subscriptions.reduce((lowest, candidate) => {
    const difference = compareUnitPrice(candidate, lowest)
    return difference < 0 || (difference === BigInt(0) && candidate.id < lowest.id) ? candidate : lowest
  })
  return { catalog, floor }
}

export function belowDiscountFloor(product: CodeProduct, floor: CodeProduct, percent: number): boolean {
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) throw new AppError('INVALID_INPUT', 'INVALID_DISCOUNT')
  return BigInt(product.priceCents) * BigInt(100 - percent) * BigInt(floor.credits)
    < BigInt(floor.priceCents) * BigInt(100) * BigInt(product.credits)
}

// Compare the collectible USD cents on this checkout against today's lowest subscription
// unit price. Only the currency amount is rounded, never either price per credit.
export function checkoutUnitPriceDifference(products: readonly CatalogInput[], id: SiteProduct['id'], percent: number): bigint {
  const { catalog, floor } = campaignCatalog(products)
  const product = catalog.find(item => item.id === id)
  if (!product) throw new AppError('INTERNAL', 'Missing checkout product in campaign catalog')
  return compareUnitPrice({ ...product, priceCents: discountedPriceCents(product.priceCents, percent) }, floor)
}
