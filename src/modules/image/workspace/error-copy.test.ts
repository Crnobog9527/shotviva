import { describe, expect, it } from 'vitest'

import { canRetry, failureReason, refundLine } from './error-copy'

describe('failure copy', () => {
  it('explains the reason and the refund', () => {
    const failure = { code: 'PROVIDER_TIMEOUT', message: '', refunded: true }
    expect(failureReason(failure)).toMatch(/too long/)
    expect(refundLine(failure)).toBe('Your credits were refunded.')
    expect(refundLine({ ...failure, refunded: null })).toBe('No credits were used.')
  })

  it('passes the rate-limit sentence through and falls back for unknown codes', () => {
    expect(failureReason({ code: 'RATE_LIMITED', message: 'Wait for one of your photos to finish', refunded: null })).toBe(
      'Wait for one of your photos to finish.',
    )
    expect(failureReason({ code: 'WHATEVER', message: '', refunded: null })).toMatch(/Something went wrong/)
  })

  it('offers Retry only when the same photo can work', () => {
    expect(canRetry({ code: 'GENERATION_FAILED', message: '', refunded: true })).toBe(true)
    expect(canRetry({ code: 'CONTENT_REJECTED', message: '', refunded: true })).toBe(false)
  })
})
