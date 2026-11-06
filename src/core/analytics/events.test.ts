import { describe, expect, it } from 'vitest'

import { eventSchemas, uploadSizeBucket, validateEvent, type EventName } from './events'

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
  signup: { method: 'google' },
  upload: { size_bucket: '1-5MB', compressed: true },
  generate,
  paywall_view: { trigger: 'insufficient_credits' },
  checkout_start: checkout,
  purchase: { ...checkout, product_id: 'pack_s', tier: 'pack', interval: null, form: 'one_time', amount_usd: 9.9, credits: 20 },
}

describe('event dictionary (ARCHITECTURE §16.2)', () => {
  it('covers exactly the six named events', () => {
    expect(Object.keys(eventSchemas).sort()).toEqual(['checkout_start', 'generate', 'paywall_view', 'purchase', 'signup', 'upload'])
  })

  it.each(Object.entries(valid))('accepts a well-formed %s', (event, props) => {
    expect(validateEvent(event as EventName, props)).toMatchObject({ ok: true })
  })

  it('rejects unknown properties, wrong enums and missing fields', () => {
    expect(validateEvent('signup', { method: 'email', plan: 'pro' }).ok).toBe(false)
    expect(validateEvent('signup', { method: 'github' }).ok).toBe(false)
    expect(validateEvent('generate', { ...generate, duration_ms: undefined }).ok).toBe(false)
    expect(validateEvent('purchase', checkout).ok).toBe(false)
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

describe('uploadSizeBucket', () => {
  it('buckets by MiB', () => {
    expect(uploadSizeBucket(900_000)).toBe('<1MB')
    expect(uploadSizeBucket(1024 * 1024)).toBe('1-5MB')
    expect(uploadSizeBucket(5 * 1024 * 1024)).toBe('1-5MB')
    expect(uploadSizeBucket(18_000_000)).toBe('>5MB')
  })
})
