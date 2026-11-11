import 'server-only'

import { z } from 'zod'

import { catalog, catalogProducts, listedProducts } from './catalog-rows'
export { listedProducts } from './catalog-rows'
import { AppError } from '../errors'
import type { PricingVersion } from './checkout-price'
import { callRpc, type RpcClient } from './rpc'

export function readProductCatalog(db: RpcClient, version: PricingVersion) {
  return callRpc(db, 'read_product_catalog', { p_version: version ?? 'v1' }, catalog)
}

// Only stable error codes go into the shared alert key and the Feishu group, never error messages.
export function catalogReadErrorCode(error: unknown): string {
  const cause = error instanceof Error ? error.cause ?? error : error
  if (cause instanceof z.ZodError) return 'INVALID_CATALOG'
  if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
    && /^[A-Z0-9_]{1,32}$/.test(cause.code)) return cause.code
  return error instanceof AppError ? error.code : 'INTERNAL'
}

async function readDeploymentCatalog(db: RpcClient, version: PricingVersion, rpc: string, params = {}) {
  try {
    return await callRpc(db, rpc, { p_version: version ?? 'v1', ...params }, catalog)
  } catch (error) {
    // PR previews can precede deployment of the new read RPC. Only the original seed
    // revisions are safe to use for this compatibility path.
    if (catalogReadErrorCode(error) !== 'PGRST202') throw error
    const original = await readProductCatalog(db, version)
    if (original.some(row => row.revision !== (version ? 2 : 1))) throw error
    return original
  }
}

export async function historicalProducts(db: RpcClient, version: PricingVersion) {
  return catalogProducts(await readDeploymentCatalog(db, version, 'read_contract_catalog'))
}

export async function publishedOffers(db: RpcClient, version: PricingVersion) {
  return listedProducts(await readDeploymentCatalog(db, version, 'read_catalog_offers'))
}

export async function waffoOffers(db: RpcClient, version: PricingVersion, store: string, mode: string) {
  return listedProducts(await readDeploymentCatalog(db, version, 'read_waffo_offers', { p_store: store, p_mode: mode }))
}
