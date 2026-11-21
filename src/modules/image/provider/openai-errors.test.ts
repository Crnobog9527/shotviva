import { expect, it } from 'vitest'

import { failureToProviderError } from './openai-errors'

it('maps the per-minute 429 to rate_limited and a spent quota to failed', () => {
  expect(failureToProviderError({ status: 429, code: 'rate_limit_exceeded', type: 'requests' }).kind).toBe('rate_limited')
  expect(failureToProviderError({ status: 429, code: 'insufficient_quota', type: 'insufficient_quota' }).kind).toBe('failed')
  expect(failureToProviderError({ status: 400, code: 'moderation_blocked', type: null }).kind).toBe('content_rejected')
})
