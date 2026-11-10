import 'server-only'
import { z } from 'zod'

import { MEMBERSHIP_TIERS, productIdSchema, type SiteProduct } from '../config'
import { AppError } from '../errors'
import { callRpc, type RpcClient } from './rpc'

const terms = z.object({ id: productIdSchema, credits: z.int().positive(), priceUsd: z.number().positive() })
const product = z.discriminatedUnion('tier', [
  terms.extend({ tier: z.literal('pack'), interval: z.null(), paidDays: z.null() }),
  terms.extend({ tier: z.enum(MEMBERSHIP_TIERS), interval: z.enum(['month', 'year']), paidDays: z.int().positive() }),
])
const meta = z.object({
  user_id: z.uuid(),
  product_id: productIdSchema,
  catalog_attempt: z.uuid(),
  catalog_price: z.string().min(1),
  catalog_revision: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number),
  pricing_version: z.literal('v2'),
  quoted_usd_cents: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number),
  quoted_credits: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number),
})
export function hasCatalogReceipt(metadata: Record<string, unknown>) {
  return metadata.catalog_attempt !== undefined || metadata.catalog_revision !== undefined || metadata.catalog_price !== undefined
}

export type ReceiptInput = {
  channel: 'stripe' | 'waffo'
  priceId: string
  unitCents: number
  reference: string
  contract: string | null
  renewal: boolean
  net: number | null
  discounted: boolean
  record?: boolean
}

export async function catalogReceipt(
  db: RpcClient,
  metadata: Record<string, unknown>,
  receipt: ReceiptInput,
): Promise<SiteProduct> {
  const m = meta.parse(metadata)
  if (m.catalog_price !== receipt.priceId || receipt.unitCents !== m.quoted_usd_cents)
    throw new AppError('INVALID_INPUT', 'Billed price differs from the contract')
  return callRpc(
    db,
    'catalog_receipt',
    {
      p_token: m.catalog_attempt,
      p_user: m.user_id,
      p_product: m.product_id,
      p_revision: m.catalog_revision,
      p_channel: receipt.channel,
      p_price: receipt.priceId,
      p_unit: receipt.unitCents,
      p_credits: m.quoted_credits,
      p_ref: receipt.reference,
      p_contract: receipt.contract,
      p_renewal: receipt.renewal,
      p_net: receipt.net,
      p_discounted: receipt.discounted,
      p_record: receipt.record !== false,
    },
    product,
  )
}
