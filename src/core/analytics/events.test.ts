import { describe, expect, it } from 'vitest'

import { pack, seededRewards } from '../../../tests/t94-config'

import { BROWSER_EVENTS, categorySlug, eventSchemas, SERVER_EVENTS, uploadSizeBucket, validateEvent, type EventName } from './events'

const generate = {
  template_id: 'ramen-studio',
  category: 'food',
  resolution: '1k',
  credits_cost: 2,
  credit_pool: 'paid',
  status: 'failed',
  error_code: 'PROVIDER_TIMEOUT',
  source: 'graylum',
  duration_ms: 31_250,
  model: 'gpt-image-2.6',
  edit_scope: null,
  batch_size: 1,
} as const

const checkout = {
  product_id: 'starter_monthly',
  tier: 'starter',
  interval: 'month',
  form: 'subscription',
  channel: 'stripe',
  method: 'card',
} as const

const valid: { [E in EventName]: unknown } = {
  code_redeem: { kind: 'invite', context: 'signup', status: 'ok', credits: seededRewards.inviteeCredits, pool: 'free', discount_percent: null },
  invite_reward: { credits: seededRewards.inviterCredits, product_id: pack.id },
  invite_share: { action: 'copy', surface: 'account' },
  signup: { method: 'google' },
  upload: { size_bucket: '1-5MB', compressed: true },
  generate,
  generate_refused: { reason: 'identity_swap', source: 'partner' },
  paywall_view: { trigger: 'insufficient_credits' },
  gallery_view: { page: 2 },
  gallery_work_view: { template_id: 'grilled-dish', category: 'food' },
  gallery_reuse: { template_id: 'grilled-dish', surface: 'work' },
  work_report: { reason: 'privacy' },
  contact_sales_click: { page: '/zh/pricing' },
  business_inquiry_submit: { volume: '500_2000', uses: ['ecommerce', 'social'] },
  checkout_start: { ...checkout, code: 'SPRING20', discount_percent: 20 },
  purchase: { ...checkout, product_id: 'pack_s', tier: 'pack', interval: null, form: 'one_time', amount_usd: pack.priceUsd, credits: pack.credits, code: 'SPRING20', amount_discount_usd: pack.priceUsd / 5 },
  template_view: { template_id: 'ramen-studio', category: 'food', surface: 'workspace' },
  template_favorite: { template_id: 'ramen-studio', category: 'food-drink', action: 'add', surface: 'create_card' },
  template_toggle: { template_id: 'ramen-studio', key: 'replate', action: 'confirmed', surface: 'workspace' },
  paywall_select: { product_id: 'pro_yearly', method: 'cn_card' },
  checkout_cancel: { product_id: 'pack_m', method: 'alipay' },
  upload_error: { reason: 'transfer_failed' },
  app_update_prompt: { action: 'shown', reason: 'version' },
}

const EVENT_NAMES = [
      'app_update_prompt',
      'business_inquiry_submit',
      'checkout_cancel',
      'checkout_start',
      'code_redeem',
      'contact_sales_click',
      'gallery_reuse',
      'gallery_view',
      'gallery_work_view',
      'generate',
      'generate_refused',
      'invite_reward',
      'invite_share',
      'paywall_select',
      'paywall_view',
      'purchase',
      'signup',
      'template_favorite',
      'template_toggle',
      'template_view',
      'upload',
      'upload_error',
      'work_report',
]

describe('event dictionary (ARCHITECTURE §16.2)', () => {
  it('covers exactly the named events', () => {
    expect(Object.keys(eventSchemas).sort()).toEqual(EVENT_NAMES)
  })

  it('sends every event from exactly one side', () => {
    const sides = [...SERVER_EVENTS, ...BROWSER_EVENTS]
    expect(new Set(sides).size).toBe(sides.length)
    expect([...sides].sort()).toEqual(Object.keys(eventSchemas).sort())
    // §16.2 (T74): checkout_cancel is a server event; the other three are browser events.
    expect(SERVER_EVENTS).toContain('checkout_cancel')
    expect(BROWSER_EVENTS).toEqual(expect.arrayContaining(['template_view', 'paywall_select', 'upload_error']))
  })

  // T74: template_view's category is the same slug generate sends: the display name before T75,
  // the category key after it, which is already a slug and passes unchanged.
  it('sends template_view with the category slug, old names and T75 keys alike', () => {
    expect(validateEvent('template_view', { template_id: 'ramen-studio', category: 'Food & Drink', surface: 'workspace' }).ok).toBe(false)
    expect(categorySlug('Food & Drink')).toBe('food-drink')
    expect(categorySlug('food-drink')).toBe('food-drink')
    expect(validateEvent('template_view', { template_id: 'ramen-studio', category: categorySlug('Food & Drink'), surface: 'workspace' }).ok).toBe(true)
  })

  // T74: enums only, so no file name, message or free text fits.
  it('keeps the four T74 events to their enums', () => {
    expect(validateEvent('template_view', { ...(valid.template_view as object), surface: 'gallery' }).ok).toBe(false)
    expect(validateEvent('template_view', { template_id: 'ramen-studio', category: 'food' }).ok).toBe(false)
    expect(validateEvent('paywall_select', { product_id: 'pro_yearly', method: 'paypal' }).ok).toBe(false)
    expect(validateEvent('checkout_cancel', { product_id: 'unknown', method: 'card' }).ok).toBe(false)
    expect(validateEvent('upload_error', { reason: 'IMG_0042.HEIC is too large' }).ok).toBe(false)
    expect(validateEvent('upload_error', { reason: 'too_large', file: 'IMG_0042.HEIC' }).ok).toBe(false)
  })

  it.each(Object.entries(valid))('accepts a well-formed %s', (event, props) => {
    expect(validateEvent(event as EventName, props)).toMatchObject({ ok: true })
  })

  it('rejects unknown properties, wrong enums and missing fields', () => {
    expect(validateEvent('signup', { method: 'email', plan: 'pro' }).ok).toBe(false)
    expect(validateEvent('signup', { method: 'github' }).ok).toBe(false)
    // Phone sign-ups (T63) report as phone.
    expect(validateEvent('signup', { method: 'phone' }).ok).toBe(true)
    expect(validateEvent('generate', { ...generate, duration_ms: undefined }).ok).toBe(false)
    expect(validateEvent('generate', { ...generate, batch_size: 30 }).ok).toBe(true)
    expect(validateEvent('generate', { ...generate, batch_size: 31 }).ok).toBe(false)
    expect(validateEvent('paywall_view', { trigger: 'tier_required' }).ok).toBe(true)
    expect(validateEvent('purchase', checkout).ok).toBe(false)
    expect(validateEvent('contact_sales_click', { page: '/pricing' }).ok).toBe(true)
    expect(validateEvent('contact_sales_click', { page: '/account' }).ok).toBe(false)
  })

  // 中国银行卡 (T64, ARCHITECTURE §6.3): checkout_start.method = 'cn_card'.
  it('takes cn_card as a checkout method', () => {
    expect(validateEvent('checkout_start', { ...checkout, method: 'cn_card' }).ok).toBe(true)
    expect(validateEvent('purchase', { ...valid.purchase as object, method: 'cn_card' }).ok).toBe(true)
    expect(validateEvent('checkout_start', { ...checkout, method: 'wechat' }).ok).toBe(false)
  })
})

describe('app_update_prompt (T90)', () => {
  // T90: the new-version banner, enums only.
  it('keeps app_update_prompt to its enums', () => {
    expect(BROWSER_EVENTS).toContain('app_update_prompt')
    expect(validateEvent('app_update_prompt', { action: 'refreshed', reason: 'error' }).ok).toBe(true)
    expect(validateEvent('app_update_prompt', { action: 'clicked', reason: 'version' }).ok).toBe(false)
    expect(validateEvent('app_update_prompt', { action: 'shown', reason: 'version', version: 'dpl_1' }).ok).toBe(false)
  })
})

describe('no personal data in events (ARCHITECTURE §16.1)', () => {
  it.each([
    ['an email field', { method: 'email', email: 'a@b.co' }],
    ['user copy', { ...generate, copy: 'tonkotsu ramen' }],
    ['the optional note', { ...generate, note: 'make it brighter' }],
    ['an edit instruction', { ...generate, edit_scope: 'background', instruction: 'Put it on a beach' }],
    ['a prompt', { ...generate, prompt: 'WRAPPED studio shot' }],
    ['an image URL', { ...generate, image_url: 'https://r2.example/outputs/u/j.png' }],
  ])('refuses %s, naming the key but never echoing the value', (_, props) => {
    const result = validateEvent('generate', props)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/a@b\.co|ramen|brighter|WRAPPED|r2\.example/)
  })

  it('refuses an email or URL smuggled into an id-shaped property', () => {
    expect(validateEvent('generate', { ...generate, template_id: 'someone@example.com' }).ok).toBe(false)
    expect(validateEvent('generate', { ...generate, category: 'https://evil.example' }).ok).toBe(false)
    expect(validateEvent('checkout_start', { ...checkout, product_id: 'Starter Monthly for a@b.co' }).ok).toBe(false)
    expect(validateEvent('generate', { ...generate, error_code: 'failed for a@b.co' }).ok).toBe(false)
  })
})

// T86 (DESIGN §6.9 item 8): the volume band and uses, and nothing a person typed.
describe('business_inquiry_submit', () => {
  it('takes known choices only and refuses contact details', () => {
    expect(validateEvent('business_inquiry_submit', { volume: 'over_10000', uses: ['ads'] }).ok).toBe(true)
    expect(validateEvent('business_inquiry_submit', { volume: 'over_10000', uses: [] }).ok).toBe(false)
    expect(validateEvent('business_inquiry_submit', { volume: 'lots', uses: ['ads'] }).ok).toBe(false)
    expect(validateEvent('business_inquiry_submit', { volume: 'over_10000', uses: ['ads'], email: 'a@b.co' }).ok).toBe(false)
    expect(validateEvent('business_inquiry_submit', { volume: 'over_10000', uses: ['ads'], company: 'Acme' }).ok).toBe(false)
  })
})

describe('uploadSizeBucket', () => {
  it('buckets by MiB', () => {
    expect(uploadSizeBucket(900_000)).toBe('<1MB')
    expect(uploadSizeBucket(1024 * 1024)).toBe('1-5MB')
    expect(uploadSizeBucket(5 * 1024 * 1024)).toBe('1-5MB')
    expect(uploadSizeBucket(18_000_000)).toBe('>5MB')
  })
})

// T73: with WeChat Pay on, the Stripe wallet line starts as alipay_or_wechat; purchase names the
// wallet that paid.
describe('wallet methods (T73)', () => {
  it('starts the wallet line as alipay_or_wechat and buys with alipay or wechat_pay', () => {
    expect(validateEvent('checkout_start', { ...checkout, method: 'alipay_or_wechat' }).ok).toBe(true)
    expect(validateEvent('checkout_start', { ...checkout, method: 'alipay' }).ok).toBe(true)
    expect(validateEvent('checkout_start', { ...checkout, method: 'wechat_pay' }).ok).toBe(false)
    expect(validateEvent('purchase', { ...valid.purchase as object, method: 'wechat_pay' }).ok).toBe(true)
    expect(validateEvent('purchase', { ...valid.purchase as object, method: 'alipay_or_wechat' }).ok).toBe(false)
  })
})

describe('generate_refused (ARCHITECTURE §5.1a, T81)', () => {
  it('carries which entry refused, never the words', () => {
    expect(SERVER_EVENTS).toContain('generate_refused')
    expect(validateEvent('generate_refused', { reason: 'identity_swap', source: 'workspace', note: 'x' }).ok).toBe(false)
    expect(validateEvent('generate_refused', { reason: 'nsfw', source: 'workspace' }).ok).toBe(false)
    expect(validateEvent('generate_refused', { reason: 'identity_swap', source: 'web' }).ok).toBe(false)
  })

  it('gallery events carry no work id and no free text (T108)', () => {
    expect(validateEvent('gallery_work_view', { template_id: 'a', category: 'food', job_id: 'x' }).ok).toBe(false)
    expect(validateEvent('gallery_view', { page: 21 }).ok).toBe(false)
    expect(validateEvent('work_report', { reason: 'other', note: 'hi' }).ok).toBe(false)
  })
})
