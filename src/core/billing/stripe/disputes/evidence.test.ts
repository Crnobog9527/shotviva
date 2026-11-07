import { describe, expect, it } from 'vitest'

import { activityLog, fitLines } from './activity-log'
import { buildEvidence, type EvidenceContext } from './evidence'
import { evidenceFactsSchema, type EvidenceFacts } from './facts'

// T82 (ARCHITECTURE §6.3 「拒付自动整理」): the draft written from dispute_evidence_facts.

const work = (minute: number, over: Record<string, unknown> = {}) => ({
  created_at: `2026-11-02T10:${String(minute).padStart(2, '0')}:00Z`,
  client_ip: '203.0.113.7',
  template_id: 'linen-studio',
  credits_cost: 3,
  resolution: '2k',
  downloaded_at: null,
  download_ip: null,
  download_count: 0,
  ...over,
})

function facts(over: Record<string, unknown> = {}): EvidenceFacts {
  return evidenceFactsSchema.parse({
    dispute: { id: 'dp_1', charge_id: 'ch_1', amount: 1990, currency: 'usd', reason: 'fraudulent', responder: 'shotviva', created_at: '2026-11-08T00:00:00Z' },
    user: { id: '00000000-0000-4000-8000-000000000001', email: 'buyer@example.test', signed_up_at: '2026-11-01T08:00:00Z', signup_ip: '203.0.113.7', banned_at: '2026-11-08T00:00:01Z' },
    payment: {
      id: 7,
      product_id: 'pro_monthly',
      method: 'cn_card',
      amount_total: 1990,
      currency: 'usd',
      created_at: '2026-11-02T09:59:00Z',
      renewal: false,
      purchase_ip: '203.0.113.7',
      purchase_user_agent: 'Mozilla/5.0 Test',
      terms_accepted_at: '2026-11-02T09:59:00Z',
      context_from: 'this_payment',
    },
    works: [work(5, { download_count: 2, downloaded_at: '2026-11-02T10:06:00Z', download_ip: '203.0.113.7' }), work(9, { client_ip: '198.51.100.2' })],
    totals: { count: 2, credits: 6, downloaded: 1 },
    ...over,
  })
}

const ctx: EvidenceContext = {
  brand: 'Shotviva',
  origin: 'https://shotviva.com',
  product: { name: 'Shotviva Pro', credits: 300, membership: 'month' },
  refundPolicyText: 'Refund Policy (https://shotviva.com/refund-policy)\n\nWithin 7 days, no credits used.',
  termsUrl: 'https://shotviva.com/terms',
  refundUrl: 'https://shotviva.com/refund-policy',
  charge: { email: 'card@example.test', name: 'Test Buyer' },
}

describe('buildEvidence', () => {
  it('fills the Stripe text fields from the account’s own records', () => {
    const evidence = buildEvidence(facts(), ctx)
    expect(evidence).toMatchObject({
      customer_email_address: 'buyer@example.test',
      customer_name: 'Test Buyer',
      customer_purchase_ip: '203.0.113.7',
      service_date: '2026-11-02',
    })
    expect(evidence.product_description).toContain('"Shotviva Pro": 300 credits, a monthly membership')
    expect(evidence.refund_policy_disclosure).toContain('they did so at 2026-11-02 09:59 UTC')
    expect(evidence.refund_policy_disclosure).toContain('Within 7 days, no credits used.')
    expect(evidence.refund_refusal_explanation).toContain('used 6 credits to create 2 images')
    expect(evidence.cancellation_policy_disclosure).toContain('Manage subscription')
    expect(evidence.uncategorized_text).toContain('1 of the 2 images with a recorded IP were created from the same IP address as the checkout (203.0.113.7)')
    expect(evidence.uncategorized_text).toContain('The account was suspended when the dispute arrived.')
    // Stripe has no terms_of_service field: it must never be sent.
    expect(evidence).not.toHaveProperty('terms_of_service')
  })

  it('logs sign-up, checkout and every work with time, IP and downloads', () => {
    const log = activityLog(facts())
    expect(log.split('\n')).toEqual([
      'Account created: 2026-11-01 08:00 UTC, sign-up IP 203.0.113.7',
      'Payment: 2026-11-02 09:59 UTC',
      'Checkout IP: 203.0.113.7',
      'Checkout browser: Mozilla/5.0 Test',
      'Terms of Service and Refund Policy accepted at checkout (required checkbox): 2026-11-02 09:59 UTC',
      'Paid images created after this payment and before the dispute: 2 (6 credits), 1 downloaded',
      '- 2026-11-02 10:05 UTC · IP 203.0.113.7 · image created (linen-studio, 2k, 3 credits) · downloaded 2x (first 2026-11-02 10:06 UTC, IP 203.0.113.7)',
      '- 2026-11-02 10:09 UTC · IP 198.51.100.2 · image created (linen-studio, 2k, 3 credits) · viewed on the website',
    ])
  })

})

describe('buildEvidence edge cases', () => {
  it('a renewal says so and uses the subscription’s first checkout; a phone account falls back to the charge email', () => {
    const base = facts()
    const renewal = { ...base, user: base.user && { ...base.user, email: null }, payment: base.payment && { ...base.payment, renewal: true, context_from: 'first_payment' as const } }
    expect(activityLog(renewal)).toContain('(automatic renewal of an active subscription)')
    expect(activityLog(renewal)).toContain('Checkout IP: 203.0.113.7 (from the first payment of this subscription)')
    expect(buildEvidence(renewal, ctx).customer_email_address).toBe('card@example.test')
  })

  it('with no payment row it says only what it knows and sends no empty fields', () => {
    const evidence = buildEvidence(facts({ payment: null, works: [], totals: { count: 0, credits: 0, downloaded: 0 } }), { ...ctx, product: null })
    expect(evidence).not.toHaveProperty('customer_purchase_ip')
    expect(evidence).not.toHaveProperty('refund_refusal_explanation')
    expect(evidence).not.toHaveProperty('cancellation_policy_disclosure')
    expect(evidence.uncategorized_text).toContain('ch_1')
    expect(Object.values(evidence).every((v) => typeof v === 'string' && v.length > 0)).toBe(true)
  })

  it('without consent recorded it points at the linked policies instead of claiming a tick', () => {
    const base = facts()
    const evidence = buildEvidence({ ...base, payment: base.payment && { ...base.payment, terms_accepted_at: null } }, ctx)
    expect(evidence.refund_policy_disclosure).toContain('linked from every page')
    expect(evidence.refund_policy_disclosure).not.toContain('tick')
  })

  it('keeps every field within Stripe’s 20,000 characters, and the total under 150,000', () => {
    const many = Array.from({ length: 200 }, (_, i) => work(i % 60, { template_id: `template-with-a-long-name-${i}` }))
    const big = facts({ works: many, totals: { count: 900, credits: 2700, downloaded: 0 } })
    const evidence = buildEvidence(big, { ...ctx, refundPolicyText: 'p'.repeat(40_000) })
    const sizes = Object.values(evidence).map((v) => v?.length ?? 0)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(20_000)
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(150_000)
    // The total stays in the header line; the list ends saying how much was left out.
    expect(evidence.access_activity_log).toContain('before the dispute: 900 (2700 credits)')
    expect(evidence.access_activity_log).toMatch(/… \d+ more line\(s\) not shown$/)
  })
})

describe('fitLines', () => {
  it('drops whole lines from the end and says how many', () => {
    const out = fitLines(['a'.repeat(50), 'b'.repeat(50), 'c'.repeat(50)], 150)
    expect(out.split('\n')).toEqual(['a'.repeat(50), '… 2 more line(s) not shown'])
  })
})
