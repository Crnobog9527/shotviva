import { describe, expect, it } from 'vitest'

import { readAnswer } from './use-checkout'

describe('checkout answer', () => {
  it('goes to the checkout URL, or says a subscription is already running (409)', () => {
    expect(readAnswer(200, { url: 'https://checkout.stripe.test/c/1' })).toEqual({ kind: 'url', url: 'https://checkout.stripe.test/c/1' })
    expect(readAnswer(409, { code: 'SUBSCRIPTION_EXISTS', message: 'x' })).toEqual({ kind: 'subscribed' })
  })

  it('throws (generic error) on anything else', () => {
    expect(() => readAnswer(409, { code: 'CONFLICT' })).toThrow()
    expect(() => readAnswer(500, null)).toThrow()
    expect(() => readAnswer(200, {})).toThrow()
  })
})
