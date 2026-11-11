import 'server-only'
import { z } from 'zod'
import { callRpc, type RpcClient } from '../../billing/rpc'
import { compareCatalog, productQuery } from '../../billing/waffo/catalog-check'
import { readWaffoCatalog } from '../../billing/waffo/client'
import { waffoConfig } from '../../billing/waffo/config'
import type { MembershipProductId } from '../../waffo-env'
import { asProduct, waffoId, type Editor } from './model'
import { ReviewError } from './stripe-review'

function termsFor(item: Editor, id: string) {
  if (item.request?.id === id && item.draft) return item.draft
  const current = item.current
  if (current) return current // reviewState already matched this exact published revision.
  throw new ReviewError('CATALOG_STALE')
}

export async function reviewWaffo(input: { db: RpcClient; actor: string; id: string; item: Editor; form: FormData }) {
  const { db, actor, id, item, form } = input
  const row = termsFor(item,id)
  const config = waffoConfig()
  const product = asProduct(item, row)
  const once = waffoId.parse(form.get('waffo_once'))
  const recurring = product.tier === 'pack' ? null : waffoId.parse(form.get('waffo_recurring'))
  const maps = { productIds: { ...config.productIds, [product.id]: once },
    subscriptionProductIds: { ...config.subscriptionProductIds, ...(recurring && { [product.id]: recurring }) } }
  const data = await readWaffoCatalog(productQuery, { store: config.storeId, one: [once], rec: recurring ? [recurring] : [] })
  if (!compareCatalog([product], maps, data).every(r => r.ok)) throw new ReviewError('WAFFO_PRICE_MISMATCH')
  if (recurring && form.get('waffo_period') !== product.interval) throw new ReviewError('WAFFO_CHECK_PERIOD')
  await callRpc(db, 'admin_catalog_waffo', { p_actor: actor,p_id: id,p_store: config.storeId,p_mode: config.mode,p_once: once,p_recurring: recurring,
    p_baseline_recurring: config.subscriptionProductIds[product.id as MembershipProductId] ?? null }, z.null())
}
