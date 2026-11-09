import 'server-only'
import { z } from 'zod'

import { type RpcClient, toRpcError } from '../billing'
import { PRODUCT_IDS } from '../config'
import { normalizeCode } from './index'
import { AppError } from '../errors'
import { belowDiscountFloor, campaignCatalog, type CatalogInput, type CodeProduct } from './admin'

const positive = z.int32().positive().nullable()
const date = z.iso.datetime({ offset: true }).nullable()
const patchSchema = z.strictObject({
  code: z.string().refine(value => normalizeCode(value) !== null), note: z.string().nullable(),
  invitee_credits: positive, invitee_pool: z.enum(['free','paid']).nullable(),
  discount_percent: z.int().min(1).max(90).nullable(), discount_products: z.array(z.enum(PRODUCT_IDS)).nonempty().nullable(),
  discount_duration: z.enum(['once','repeating','forever']).nullable(), discount_months: positive,
  discount_valid_days: positive, stripe_coupon_id: z.string().min(1).nullable(),
  starts_at: date, expires_at: date, max_redemptions: positive, new_users_only: z.boolean(), active: z.boolean(),
}).partial().refine(value => Object.keys(value).length > 0)

const inputErrors = new Set(['INVALID_CODE_KIND', 'INVALID_DISCOUNT', 'CODE_DISCOUNT_IMMUTABLE',
  'CODE_QUOTA_BELOW_CLAIMED', 'CODE_GIFT_LIMIT', 'CODE_GIFT_CAP_REQUIRED'])

function discountError(fields: z.infer<typeof patchSchema>, catalog: CodeProduct[], floor: CodeProduct) {
  const { discount_percent: percent, discount_products: targets } = fields
  const invalid = percent && targets ? targets.filter(id => {
    const product = catalog.find(item => item.id === id)
    return !product || belowDiscountFloor(product, floor, percent)
  }) : []
  return new AppError('INVALID_INPUT', invalid.length ? 'CODE_DISCOUNT_PRODUCTS: ' + invalid.join(', ') : 'CODE_DISCOUNT_PRODUCTS')
}

export async function saveCode(db: RpcClient, actor: string, codeId: string, fields: unknown, products: readonly CatalogInput[]) {
  const patch = patchSchema.safeParse(fields)
  if (!z.uuid().safeParse(codeId).success || !patch.success) throw new AppError('INVALID_INPUT', 'INVALID_CODE_FIELDS')
  const { catalog, floor } = campaignCatalog(products)
  const { data, error } = await db.rpc('admin_save_code', {
    p_actor: actor, p_code_id: codeId, p_fields: patch.data, p_catalog: catalog, p_floor_product_id: floor.id,
  })
  if (error) {
    // The locked row determines whether the submitted terms belong to an existing campaign.
    // Its unchanged terms stay valid for metadata edits even after a catalog reprice.
    if (error.message === 'CODE_DISCOUNT_PRODUCTS') throw discountError(patch.data, catalog, floor)
    if (inputErrors.has(error.message)) throw new AppError('INVALID_INPUT', error.message)
    throw toRpcError('admin_save_code', error)
  }
  if (data !== codeId.toLowerCase()) throw new AppError('INTERNAL', 'Unexpected saved campaign ID')
  return codeId.toLowerCase()
}
