import { describe, expect, it } from 'vitest'

import { readAnswer } from './use-checkout'

describe('checkout answer', () => {
  it('goes to the checkout URL, or says a subscription is already running (409)', () => {
    expect(readAnswer(200, { url: 'https://checkout.stripe.test/c/1' })).toEqual({ kind: 'url', url: 'https://checkout.stripe.test/c/1' })
    expect(readAnswer(409, { code: 'DOWNGRADE_NOT_ALLOWED', message: 'x' })).toEqual({ kind: 'refused' })
  })

  it('throws (generic error) on anything else', () => {
    expect(() => readAnswer(409, { code: 'CONFLICT' })).toThrow()
    expect(() => readAnswer(500, null)).toThrow()
    expect(() => readAnswer(200, {})).toThrow()
  })
})

it('keeps one nonce for an interrupted purchase and replaces it for another purchase or after expiry', async () => {
  const { checkoutAttempt } = await import('./use-checkout')
  const first = checkoutAttempt('A', null, 0)
  expect(checkoutAttempt('A', first, 100)).toBe(first)
  expect(checkoutAttempt('B', first, 100).id).not.toBe(first.id)
  expect(checkoutAttempt('A', first, 1_800_000).id).not.toBe(first.id)
  expect(readAnswer(409, { code: 'CODE_CHECKOUT_IN_PROGRESS' })).toEqual({ kind: 'in_use' })
  expect(readAnswer(409, { code: 'CODE_CHECKOUT_OFFER_CHANGED' })).toEqual({ kind: 'offer_changed' })
})

it('identifies old tabs and binds v2 subscription and pack checkouts to their displayed total', async () => {
  const { displayedTerms } = await import('./use-checkout')
  expect(displayedTerms(71300, 'v1')).toEqual({ pricing_version: 'v1', expected_price_cents: undefined })
  for (const cents of [89100, 19104, 2365, 990]) {
    expect(displayedTerms(cents, 'v2')).toEqual({ pricing_version: 'v2', expected_price_cents: cents })
  }
})
