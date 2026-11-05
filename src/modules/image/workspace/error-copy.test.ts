import { describe, expect, it } from 'vitest'

import { echoTranslate } from '../echo-translate'
import { canRetry, failureReason, refundLine } from './error-copy'

const t = echoTranslate(['PROVIDER_TIMEOUT', 'RATE_LIMITED'])

describe('failure copy', () => {
  it('picks the reason by code and falls back for unknown codes', () => {
    expect(failureReason({ code: 'PROVIDER_TIMEOUT', message: '', refunded: true }, t)).toBe('PROVIDER_TIMEOUT')
    expect(failureReason({ code: 'WHATEVER', message: '', refunded: null }, t)).toBe('fallback')
  })

  it('says whether the credits came back', () => {
    const failure = { code: 'GENERATION_FAILED', message: '', refunded: true }
    expect(refundLine(failure, t)).toBe('refunded')
    expect(refundLine({ ...failure, refunded: false }, t)).toBe('onHold')
    expect(refundLine({ ...failure, refunded: null }, t)).toBe('notCharged')
  })

  it('offers Retry only when the same photo can work', () => {
    expect(canRetry({ code: 'GENERATION_FAILED', message: '', refunded: true })).toBe(true)
    expect(canRetry({ code: 'CONTENT_REJECTED', message: '', refunded: true })).toBe(false)
  })
})
