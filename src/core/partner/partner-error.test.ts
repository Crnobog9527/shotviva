import { describe, expect, it } from 'vitest'

import { AppError } from '../errors'
import { GenerationFailure } from '../jobs'
import { partnerErrorResponse, PartnerError, toPartnerErrorBody } from './partner-error'

const TOP_UP = 'https://shotviva.com/pricing?from=graylum'

describe('partner error mapping (ARCHITECTURE §14.4)', () => {
  it('402 quota_exhausted carries top_up_url', async () => {
    const response = partnerErrorResponse(new AppError('CREDITS_INSUFFICIENT', 'no credits'), { route: 't', topUpUrl: TOP_UP })
    expect(response.status).toBe(402)
    expect(await response.json()).toMatchObject({ code: 'quota_exhausted', top_up_url: TOP_UP })
  })

  it.each([
    [new PartnerError('link_revoked', 'x'), 401, 'link_revoked'],
    [new PartnerError('unauthorized', 'x'), 401, 'unauthorized'],
    [new AppError('IMAGE_TOO_LARGE', 'x'), 422, 'invalid_input'],
    [new AppError('INVALID_INPUT', 'x'), 422, 'invalid_input'],
    [new AppError('RATE_LIMITED', 'x'), 429, 'rate_limited'],
    [new AppError('FORBIDDEN', 'USER_BANNED'), 401, 'link_revoked'],
    [new Error('boom'), 500, 'internal'],
  ])('%s → %i %s', (error, status, code) => {
    const response = partnerErrorResponse(error, { route: 't' })
    expect(response.status).toBe(status)
    expect(toPartnerErrorBody(error).code).toBe(code)
  })

  it('content_rejected and generation_failed name the refunded job', () => {
    const rejected = new GenerationFailure(new AppError('CONTENT_REJECTED', 'declined'), 'job-1', true)
    expect(toPartnerErrorBody(rejected)).toMatchObject({ code: 'content_rejected', job_id: 'job-1', refunded: true })
    const failed = new GenerationFailure(new AppError('GENERATION_FAILED', 'failed'), 'job-2', true)
    expect(partnerErrorResponse(failed, { route: 't' }).status).toBe(500)
  })

  it('never leaks internal messages', () => {
    expect(toPartnerErrorBody(new AppError('INTERNAL', 'rpc reserve_credits failed: secret detail')).message).toBe('Something went wrong')
  })
})
