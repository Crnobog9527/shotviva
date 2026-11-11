import { z } from 'zod'

import { CREDIT_POOLS } from '../billing/pools'
import { MAX_BATCH_SIZE } from '../billing/tier-limits'
import { productIdSchema } from '../config/product-id'
import { INQUIRY_USES, MONTHLY_VOLUMES } from '../inquiries/summary-choices'
import { EDIT_SCOPES } from '../templates/edit-params'
import { UPLOAD_SIZE_BUCKETS } from './event-values'
import { findPii } from './pii'

// The event dictionary of ARCHITECTURE §16.2. Names and properties are fixed; changing one
// is a [spec] PR first. Every schema is strict and only takes enums, numbers, booleans and
// slug-shaped ids, so free text (email, user copy, `note`, prompts, image URLs) cannot fit.

// Template ids, categories and error codes are all lowercase/uppercase slugs in the database.
const slug = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/).max(64)
const errorCode = z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(64)
// A template toggle's key (templates.fields.toggles, T89).
const toggleKey = z.string().regex(/^[a-z][a-z0-9_]*$/).max(64)

export { categorySlug, UPLOAD_SIZE_BUCKETS, uploadSizeBucket } from './event-values'
export const RESOLUTIONS = ['1k', '2k', '3k'] as const
// watermark_download (T107): a free, watermarked photo was just downloaded or saved.
export const PAYWALL_TRIGGERS = ['insufficient_credits', 'pricing_page', 'account', 'graylum', 'tier_required', 'watermark_download'] as const
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
// Where a `generate_refused` came from: the workspace (note or text fields), a photo edit, the
// partner API. Mirrors core/identity-guard IDENTITY_ENTRIES.
export const IDENTITY_SOURCES = ['workspace', 'edit', 'partner'] as const
export const CONTACT_SALES_PAGES = ['/pricing', '/zh/pricing'] as const
// T74 (ARCHITECTURE §16.2): where a template was looked at, and why an upload failed. Enums
// only, so a file name or an error message can never ride along.
export const TEMPLATE_VIEW_SURFACES = ['workspace', 'home_picker'] as const
// T83 (ARCHITECTURE §5.1b): where a template was saved or unsaved.
export const TEMPLATE_FAVORITE_SURFACES = ['create_card', 'create_dialog', 'home_picker'] as const
// T89 (ARCHITECTURE §16.2): a template toggle's confirm dialog and turning one off, and where.
export const TEMPLATE_TOGGLE_ACTIONS = ['confirm_shown', 'confirmed', 'cancelled', 'turned_off'] as const
export const TEMPLATE_TOGGLE_SURFACES = ['workspace', 'create_dialog', 'home'] as const
// T90: the new-version banner, shown by a version check or by a stale-build failure.
export const APP_UPDATE_ACTIONS = ['shown', 'refreshed', 'dismissed'] as const
export const APP_UPDATE_REASONS = ['version', 'error'] as const
// T108 (ARCHITECTURE §16.2): where 「一键复用」 was clicked, and why a work was reported.
export const GALLERY_REUSE_SURFACES = ['work', 'gallery'] as const
export const WORK_REPORT_REASONS = ['sexual', 'violence', 'hate', 'minor', 'privacy', 'ip', 'spam', 'other'] as const
export const UPLOAD_ERROR_REASONS = ['too_large', 'unsupported', 'ticket_failed', 'transfer_failed', 'unknown'] as const

const campaignCode = z.string().regex(/^[A-Z0-9]{4,20}$/)

const checkoutProps = {
  product_id: productIdSchema,
  tier: z.enum(PRODUCT_TIERS),
  // ARCHITECTURE §6.2: empty for credit packs.
  interval: z.enum(PRODUCT_INTERVALS).nullable(),
  form: z.enum(CHECKOUT_FORMS),
  channel: z.enum(PAYMENT_CHANNELS),
}

export const eventSchemas = {
  signup: z.strictObject({ method: z.enum(['email', 'google', 'phone']), code_kind: z.enum(['invite', 'campaign']).nullable().optional() }),
  code_redeem: z.strictObject({
    kind: z.enum(['invite', 'campaign']).nullable(), code: campaignCode.optional(),
    context: z.enum(['signup', 'account', 'paywall']), status: slug, credits: z.number().int().nonnegative(),
    pool: z.enum(CREDIT_POOLS).nullable(), discount_percent: z.number().int().min(1).max(90).nullable(),
  }).refine((r) => !r.code || r.kind === 'campaign'),
  invite_reward: z.strictObject({ credits: z.number().int().positive(), product_id: productIdSchema }),
  invite_share: z.strictObject({ action: z.enum(['copy', 'share']), surface: z.literal('account') }),
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
    // Number of distinct templates across the retained cells.
    batch_templates: z.int().min(1).max(5).default(1),
    // Total retained cells, including this job; 1 for a single generation.
    batch_size: z.number().int().min(1).max(MAX_BATCH_SIZE),
    // The template's toggles as chosen (T89), key → on; {} for a template without any.
    toggles: z.record(toggleKey, z.boolean()).optional(),
  }),
  // A request refused before charging (ARCHITECTURE §5.1a, T81): which entry, never the words.
  generate_refused: z.strictObject({ reason: z.enum(['identity_swap']), source: z.enum(IDENTITY_SOURCES) }),
  paywall_view: z.strictObject({ trigger: z.enum(PAYWALL_TRIGGERS) }),
  // T108: the public gallery. Never a work id, never a user's text.
  gallery_view: z.strictObject({ page: z.int().min(1).max(20) }),
  gallery_work_view: z.strictObject({ template_id: slug, category: slug }),
  gallery_reuse: z.strictObject({ template_id: slug, surface: z.enum(GALLERY_REUSE_SURFACES) }),
  work_report: z.strictObject({ reason: z.enum(WORK_REPORT_REASONS) }),
  // The pricing page's "For business" Contact us (DESIGN §6.9 item 8, T37).
  contact_sales_click: z.strictObject({ page: z.enum(CONTACT_SALES_PAGES) }),
  // T86: the business inquiry form was stored. The volume band and uses only, never a contact.
  business_inquiry_submit: z.strictObject({
    volume: z.enum(MONTHLY_VOLUMES),
    uses: z.array(z.enum(INQUIRY_USES)).min(1).max(INQUIRY_USES.length),
  }),
  checkout_start: z.strictObject({ ...checkoutProps, method: z.enum(CHECKOUT_START_METHODS),
    code: campaignCode.optional(), discount_percent: z.number().int().min(1).max(90).optional() }),
  // T74: the template workspace opened, or a template picked in the home generator's picker.
  template_view: z.strictObject({ template_id: slug, category: slug, surface: z.enum(TEMPLATE_VIEW_SURFACES) }),
  // T83: a template saved or unsaved (sent once the server has it, so a rolled-back tap is not counted).
  template_favorite: z.strictObject({
    template_id: slug,
    category: slug,
    action: z.enum(['add', 'remove']),
    surface: z.enum(TEMPLATE_FAVORITE_SURFACES),
  }),
  // T89: a toggle's confirm dialog shown, accepted or cancelled, or the toggle turned off.
  template_toggle: z.strictObject({
    template_id: slug,
    key: toggleKey,
    action: z.enum(TEMPLATE_TOGGLE_ACTIONS),
    surface: z.enum(TEMPLATE_TOGGLE_SURFACES),
  }),
  // T74: a product picked inside the paywall (a tier, a pack, or Monthly / Yearly moving the pick).
  paywall_select: z.strictObject({ product_id: productIdSchema, method: z.enum(PAYMENT_METHODS) }),
  // T74: the buyer came back from the hosted checkout without paying (Stripe's cancel_url).
  checkout_cancel: z.strictObject({ product_id: productIdSchema, method: z.enum(PAYMENT_METHODS) }),
  upload_error: z.strictObject({ reason: z.enum(UPLOAD_ERROR_REASONS) }),
  app_update_prompt: z.strictObject({ action: z.enum(APP_UPDATE_ACTIONS), reason: z.enum(APP_UPDATE_REASONS) }),
  purchase: z.strictObject({
    ...checkoutProps,
    method: z.enum(PAYMENT_METHODS),
    amount_usd: z.number().nonnegative(),
    code: campaignCode.optional(), amount_discount_usd: z.number().nonnegative().optional(),
    credits: z.number().int().nonnegative().optional(),
  }),
} as const

export type EventName = keyof typeof eventSchemas
export type EventProps<E extends EventName> = z.infer<(typeof eventSchemas)[E]>

// §16.2: money and credit events go out from the server so ad blockers cannot drop them.
export const SERVER_EVENTS = ['code_redeem', 'invite_reward', 'signup', 'generate', 'generate_refused', 'checkout_start', 'checkout_cancel', 'purchase', 'work_report'] as const
export const BROWSER_EVENTS = [
  'invite_share',
  'upload',
  'upload_error',
  'paywall_view',
  'paywall_select',
  'template_view',
  'template_favorite',
  'template_toggle',
  'contact_sales_click',
  'app_update_prompt',
  'business_inquiry_submit',
  'gallery_view',
  'gallery_work_view',
  'gallery_reuse',
] as const
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
