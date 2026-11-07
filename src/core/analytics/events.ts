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
// No WeChat Pay (Owner 2026-11-05, ARCHITECTURE §6.2). `cn_card` is 中国银行卡, the zh pages'
// plain Stripe card route (T64, §6.3); `card` stays the Managed Payments card group.
export const PAYMENT_METHODS = ['card', 'alipay', 'cn_card'] as const
// Where a `generate_refused` came from: the workspace (note or text fields), a photo edit, the
// partner API. Mirrors core/identity-guard IDENTITY_ENTRIES.
export const IDENTITY_SOURCES = ['workspace', 'edit', 'partner'] as const
export const CONTACT_SALES_PAGES = ['/pricing', '/zh/pricing'] as const

const checkoutProps = {
  product_id: z.enum(PRODUCT_IDS),
  tier: z.enum(PRODUCT_TIERS),
  // ARCHITECTURE §6.2: empty for credit packs.
  interval: z.enum(PRODUCT_INTERVALS).nullable(),
  form: z.enum(CHECKOUT_FORMS),
  channel: z.enum(PAYMENT_CHANNELS),
  method: z.enum(PAYMENT_METHODS),
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
  // A request refused before charging (ARCHITECTURE §5.1a, T81): which entry, never the words.
  generate_refused: z.strictObject({ reason: z.enum(['identity_swap']), source: z.enum(IDENTITY_SOURCES) }),
  paywall_view: z.strictObject({ trigger: z.enum(PAYWALL_TRIGGERS) }),
  // The pricing page's "For business" Contact us (DESIGN §6.9 item 8, T37).
  contact_sales_click: z.strictObject({ page: z.enum(CONTACT_SALES_PAGES) }),
  checkout_start: z.strictObject(checkoutProps),
  purchase: z.strictObject({
    ...checkoutProps,
    amount_usd: z.number().nonnegative(),
    credits: z.number().int().nonnegative(),
  }),
} as const

export type EventName = keyof typeof eventSchemas
export type EventProps<E extends EventName> = z.infer<(typeof eventSchemas)[E]>

// §16.2: money and credit events go out from the server so ad blockers cannot drop them.
export const SERVER_EVENTS = ['signup', 'generate', 'generate_refused', 'checkout_start', 'purchase'] as const
export const BROWSER_EVENTS = ['upload', 'paywall_view', 'contact_sales_click'] as const
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

const MB = 1024 * 1024

export function uploadSizeBucket(bytes: number): (typeof UPLOAD_SIZE_BUCKETS)[number] {
  if (bytes < MB) return '<1MB'
  return bytes <= 5 * MB ? '1-5MB' : '>5MB'
}
