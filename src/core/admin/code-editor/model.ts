import { z } from 'zod'

import { discountedPriceCents } from '../../codes'
import { belowDiscountFloor, type CodeProduct } from '../../codes/admin'
import { PRODUCT_IDS, type ProductId } from '../../config'
import { beijingLocalToIso, toBeijingLocal } from '../shell/format'
import { COPY, PRODUCTS } from './copy'

export const editable = z.object({
  code: z.string(), note: z.string().nullable(), invitee_credits: z.number().int().positive().nullable(),
  invitee_pool: z.enum(['free','paid']).nullable(), discount_percent: z.number().int().nullable(),
  discount_duration: z.enum(['once','repeating','forever']).nullable(), discount_months: z.number().int().nullable(),
  discount_products: z.array(z.enum(PRODUCT_IDS)).nullable(), discount_valid_days: z.number().int().nullable(),
  starts_at: z.string().nullable(), expires_at: z.string().nullable(), max_redemptions: z.number().int().nullable(),
  new_users_only: z.boolean(), redemption_count: z.number().int().nonnegative(),
})
export const giftPolicy = z.object({ maxCreditsPerCode: z.int32().positive(), requirePaidGiftCap: z.boolean() })
export type Existing = z.infer<typeof editable>
export type Policy = z.infer<typeof giftPolicy>
export type Catalog = { catalog: CodeProduct[]; floor: CodeProduct }
export type Duration = NonNullable<Existing['discount_duration']>
export type Preset = 'promo' | 'gift' | 'both'

export function productGroup(ids: ProductId[], group: 'monthly' | 'yearly' | 'packs' | 'all') {
  if (group === 'all') return ids
  return ids.filter(id => group === 'packs' ? id.startsWith('pack_') : id.endsWith('_' + group))
}

// The save RPC compares the exact ratio. Also check collectible cents so half-cent
// rounding cannot create a new offer which checkout would immediately reject.
export function tooLow(p: CodeProduct, floor: CodeProduct, percent: number) {
  return belowDiscountFloor(p, floor, percent)
    || BigInt(discountedPriceCents(p.priceCents, percent)) * BigInt(floor.credits) < BigInt(floor.priceCents) * BigInt(p.credits)
}
export function pricePerCredit(cents: number, credits: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol',
    maximumSignificantDigits: 6 }).format(cents / (100 * credits))
}
export const localDate = (iso?: string | null) => iso ? toBeijingLocal(iso) : ''

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim()
const number = (form: FormData, name: string) => text(form, name) ? Number(text(form, name)) : null
function date(form: FormData, name: string, original?: string | null) {
  const local = text(form, name)
  return original && localDate(original) === local ? original : beijingLocalToIso(local)
}
export function formPatch(form: FormData, existing: Existing | null) {
  const patch = {
    code: text(form,'code').toUpperCase(), note: text(form,'note') || null, invitee_credits: number(form,'credits'),
    invitee_pool: form.get('pool'), max_redemptions: number(form,'quota'), new_users_only: form.has('onlyNew'),
    starts_at: date(form,'starts',existing?.starts_at), expires_at: date(form,'ends',existing?.expires_at),
  }
  if (existing) return Object.fromEntries(Object.entries(patch).filter(([k,v]) => existing[k as keyof typeof patch] !== v))
  if (!form.has('percent')) return patch
  return { ...patch, discount_percent: number(form,'percent'), discount_duration: text(form,'period'),
    discount_products: form.getAll('products'), discount_months: number(form,'months'), discount_valid_days: number(form,'days') }
}

export function offerError({catalog, floor}: Catalog, percent: number, ids: ProductId[]) {
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) return COPY.invalidPercent
  if (!ids.length) return COPY.noTargets
  const bad = catalog.filter(p => ids.includes(p.id) && tooLow(p,floor,percent))
  return bad.length ? COPY.invalidTargets(bad.map(p => PRODUCTS[p.id])) : null
}

export const emptyCode: Existing = {
  code: '', note: null, invitee_credits: null, invitee_pool: null, discount_percent: null, discount_products: null,
  discount_duration: null, discount_months: null, discount_valid_days: null, starts_at: null, expires_at: null,
  max_redemptions: null, new_users_only: false, redemption_count: 0,
}

export function originalPreset(code: Existing): Preset {
  if (!code.discount_percent) return 'gift'
  return code.invitee_credits ? 'both' : 'promo'
}
export function giftChanged(code: Existing, credits: string, pool: string, quota: string) {
  return Number(credits) !== code.invitee_credits || pool !== code.invitee_pool || quota !== String(code.max_redemptions ?? '')
}
