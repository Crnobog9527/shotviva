import { describe, expect, it } from 'vitest'

import { echoTranslate } from '../echo-translate'
import { canRetry, failureReason, readFailure, refundLine, refundState, specificReason } from './error-copy'

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

  it('shows a reason beside the kept line only when the user can act on it', () => {
    const scoped = echoTranslate(['PROVIDER_TIMEOUT', 'RATE_LIMITED', 'INTERNAL'])
    expect(specificReason({ code: 'RATE_LIMITED', message: '', refunded: null }, scoped)).toBe('RATE_LIMITED')
    expect(specificReason({ code: 'PROVIDER_TIMEOUT', message: '', refunded: true }, scoped)).toBeNull()
    expect(specificReason({ code: 'INTERNAL', message: '', refunded: true }, scoped)).toBeNull()
    expect(specificReason({ code: 'WHATEVER', message: '', refunded: null }, scoped)).toBeNull()
  })

  it('names where the credits stand for the meta line', () => {
    const failure = { code: 'GENERATION_FAILED', message: '', refunded: true }
    expect(refundState(failure)).toBe('refunded')
    expect(refundState({ ...failure, refunded: false })).toBe('hold')
    expect(refundState({ ...failure, refunded: null })).toBe('none')
  })

  it('reads a missing failure as a generic one, and Retry needs the photo still there', () => {
    expect(readFailure(null)).toEqual({ failure: { code: 'INTERNAL', message: '', refunded: null }, retry: true })
    const failure = { code: 'GENERATION_FAILED', message: '', refunded: true }
    expect(readFailure(failure, false).retry).toBe(false)
    expect(readFailure({ ...failure, code: 'CONTENT_REJECTED' }).retry).toBe(false)
  })
})
