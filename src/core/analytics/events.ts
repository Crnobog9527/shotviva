import { z } from 'zod'

import { CREDIT_POOLS } from '../billing/pools'
import { MAX_BATCH_SIZE } from '../billing/tier-limits'
import { PRODUCT_IDS } from '../config/define-site'
import { EDIT_SCOPES } from '../templates/edit-params'
import { findPii } from './pii'

// The event dictionary of ARCHITECTURE §16.2. Names and properties are fixed; changing one
// is a [spec] PR first. Every schema is strict and only takes enums, numbers, booleans and
// slug-shaped ids, so free text (email, user copy, `note`, prompts, image URLs) cannot fit.

// Template ids, categories and error codes are all lowercase/uppercase slugs in the database.
const slug = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/).max(64)
const errorCode = z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(64)

export const UPLOAD_SIZE_BUCKETS = ['<1MB', '1-5MB', '>5MB'] as const
export const RESOLUTIONS = ['1k', '2k', '3k'] as const
export const PAYWALL_TRIGGERS = ['insufficient_credits', 'pricing_page', 'account', 'graylum', 'tier_required'] as const
export const PRODUCT_TIERS = ['starter', 'pro', 'max', 'pack'] as const
export const PRODUCT_INTERVALS = ['month', 'year'] as const
export const CHECKOUT_FORMS = ['subscription', 'one_time'] as const
export const PAYMENT_CHANNELS = ['stripe', 'waffo'] as const
// `cn_card` is 中国银行卡, the zh pages' plain Stripe card route (T64, §6.3); `card` stays the
// Managed Payments card group. `purchase` records the method that paid: Alipay or WeChat Pay
// (T73), both offered on the one Stripe wallet checkout. `checkout_start` fires before the
// buyer has picked one on that page, so the Stripe wallet line starts as `alipay_or_wechat`;
// Waffo's wallet line is Alipay alone and starts as `alipay`.
export const PAYMENT_METHODS = ['card', 'alipay', 'wechat_pay', 'cn_card'] as const
export const CHECKOUT_START_METHODS = ['card', 'alipay', 'alipay_or_wechat', 'cn_card'] as const
export type CheckoutStartMethod = (typeof CHECKOUT_START_METHODS)[number]
export const CONTACT_SALES_PAGES = ['/pricing', '/zh/pricing'] as const
// T74 (ARCHITECTURE §16.2): where a template was looked at, and why an upload failed. Enums
// only, so a file name or an error message can never ride along.
export const TEMPLATE_VIEW_SURFACES = ['workspace', 'home_picker'] as const
// T83 (ARCHITECTURE §5.1b): where a template was saved or unsaved.
export const TEMPLATE_FAVORITE_SURFACES = ['create_card', 'create_dialog', 'home_picker'] as const
export const UPLOAD_ERROR_REASONS = ['too_large', 'unsupported', 'ticket_failed', 'transfer_failed', 'unknown'] as const

const checkoutProps = {
  product_id: z.enum(PRODUCT_IDS),
  tier: z.enum(PRODUCT_TIERS),
  // ARCHITECTURE §6.2: empty for credit packs.
  interval: z.enum(PRODUCT_INTERVALS).nullable(),
  form: z.enum(CHECKOUT_FORMS),
  channel: z.enum(PAYMENT_CHANNELS),
}

export const eventSchemas = {
  signup: z.strictObject({ method: z.enum(['email', 'google', 'phone']) }),
  upload: z.strictObject({ size_bucket: z.enum(UPLOAD_SIZE_BUCKETS), compressed: z.boolean() }),
  generate: z.strictObject({
    template_id: slug,
    category: slug,
    resolution: z.enum(RESOLUTIONS),
    credits_cost: z.number().int().positive(),
    credit_pool: z.enum(CREDIT_POOLS),
    status: z.enum(['succeeded', 'failed']),
    error_code: errorCode.nullable(),
    source: z.enum(['web', 'graylum']),
    duration_ms: z.number().int().nonnegative(),
    // Model name only (ARCHITECTURE §16.2); null for jobs written before T17.
    model: z.string().min(1).max(120).nullable(),
    // Photo edits only (ARCHITECTURE §5.2, T30): the range judged, or 'fallback'.
    edit_scope: z.enum(EDIT_SCOPES).nullable(),
    // Photos in the workspace batch this one belonged to; 1 for a single photo (T28).
    batch_size: z.number().int().min(1).max(MAX_BATCH_SIZE),
  }),
  paywall_view: z.strictObject({ trigger: z.enum(PAYWALL_TRIGGERS) }),
  // The pricing page's "For business" Contact us (DESIGN §6.9 item 8, T37).
  contact_sales_click: z.strictObject({ page: z.enum(CONTACT_SALES_PAGES) }),
  checkout_start: z.strictObject({ ...checkoutProps, method: z.enum(CHECKOUT_START_METHODS) }),
  // T74: the template workspace opened, or a template picked in the home generator's picker.
  template_view: z.strictObject({ template_id: slug, category: slug, surface: z.enum(TEMPLATE_VIEW_SURFACES) }),
  // T83: a template saved or unsaved (sent once the server has it, so a rolled-back tap is not counted).
  template_favorite: z.strictObject({
    template_id: slug,
    category: slug,
    action: z.enum(['add', 'remove']),
    surface: z.enum(TEMPLATE_FAVORITE_SURFACES),
  }),
  // T74: a product picked inside the paywall (a tier, a pack, or Monthly / Yearly moving the pick).
  paywall_select: z.strictObject({ product_id: z.enum(PRODUCT_IDS), method: z.enum(PAYMENT_METHODS) }),
  // T74: the buyer came back from the hosted checkout without paying (Stripe's cancel_url).
  checkout_cancel: z.strictObject({ product_id: z.enum(PRODUCT_IDS), method: z.enum(PAYMENT_METHODS) }),
  upload_error: z.strictObject({ reason: z.enum(UPLOAD_ERROR_REASONS) }),
  purchase: z.strictObject({
    ...checkoutProps,
    method: z.enum(PAYMENT_METHODS),
    amount_usd: z.number().nonnegative(),
    credits: z.number().int().nonnegative(),
  }),
} as const

export type EventName = keyof typeof eventSchemas
export type EventProps<E extends EventName> = z.infer<(typeof eventSchemas)[E]>

// §16.2: money and credit events go out from the server so ad blockers cannot drop them.
export const SERVER_EVENTS = ['signup', 'generate', 'checkout_start', 'checkout_cancel', 'purchase'] as const
export const BROWSER_EVENTS = ['upload', 'upload_error', 'paywall_view', 'paywall_select', 'template_view', 'template_favorite', 'contact_sales_click'] as const
export type ServerEventName = (typeof SERVER_EVENTS)[number]
export type BrowserEventName = (typeof BROWSER_EVENTS)[number]

export type ValidatedEvent<E extends EventName> = { ok: true; props: EventProps<E> } | { ok: false; issues: string[] }

// Returns issue paths only, never the offending values (they may be the very PII we refuse).
export function validateEvent<E extends EventName>(event: E, props: unknown): ValidatedEvent<E> {
  const pii = findPii(props)
  if (pii.length > 0) return { ok: false, issues: pii }
  const result = eventSchemas[event].safeParse(props)
  if (result.success) return { ok: true, props: result.data as EventProps<E> }
  return { ok: false, issues: result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`) }
}

// templates.category holds the admin's display name since T53 ("Products & Resale", "Food &
// Drink"), but the dictionary takes a slug (§16.2), so every `generate` event was refused and
// dropped ("category: invalid_format" in production logs). Lowercased, with each run of other
// characters turned into one hyphen; a name with no Latin letters or digits left becomes
// 'uncategorized' rather than losing the event. From T75 the column holds the category's stable
// key (already this shape, e.g. 'food-drink'), which passes through unchanged, so events before
// and after T75 carry the same value. Used by `generate` (server), `template_view` and `template_favorite` (browser).
export function categorySlug(category: string): string {
  const slug = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
  return slug || 'uncategorized'
}

const MB = 1024 * 1024

export function uploadSizeBucket(bytes: number): (typeof UPLOAD_SIZE_BUCKETS)[number] {
  if (bytes < MB) return '<1MB'
  return bytes <= 5 * MB ? '1-5MB' : '>5MB'
}
