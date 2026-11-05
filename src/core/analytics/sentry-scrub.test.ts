import type { ErrorEvent } from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'

import { scrubBreadcrumb, scrubEvent } from './sentry-scrub'

describe('scrubEvent (ARCHITECTURE §16.3)', () => {
  const event: ErrorEvent = {
    type: undefined,
    message: 'refund failed for jane@example.com',
    user: { id: 'user-1', email: 'jane@example.com', ip_address: '203.0.113.9' },
    request: {
      method: 'GET',
      url: 'https://shotviva.com/auth/callback?code=one-time-code',
      cookies: { 'sb-access-token': 'eyJabc.def.ghi' },
      headers: { authorization: 'Bearer sv_test_abcdefgh123' },
      data: { copy: { dish: 'tonkotsu ramen' } },
    },
    exception: { values: [{ type: 'Error', value: 'openai said no to Bearer sk_live_abcdefghijk' }] },
    extra: { prompt: 'WRAPPED studio shot', note: 'make it brighter', jobId: 'job-1' },
    contexts: { details: { email: 'jane@example.com', stage: 'provider' } },
    breadcrumbs: [{ message: 'fetch jane@example.com', data: { body: '{"copy":"ramen"}' } }],
  }

  it('keeps ids and codes but drops emails, tokens, prompts and user copy', () => {
    const out = scrubEvent(event)
    const text = JSON.stringify(out)
    expect(text).not.toMatch(/jane@example\.com|one-time-code|eyJabc|sv_test_|sk_live_|WRAPPED|brighter|ramen|203\.0\.113/)
    expect(out.user).toEqual({ id: 'user-1' })
    expect(out.request).toEqual({ method: 'GET', url: 'https://shotviva.com/auth/callback' })
    expect(out.extra).toMatchObject({ jobId: 'job-1' })
    expect(out.contexts).toMatchObject({ details: { stage: 'provider' } })
  })

  it('scrubs breadcrumbs on their own too, presigned URLs included', () => {
    expect(JSON.stringify(scrubBreadcrumb({ message: 'user jane@example.com', data: { note: 'x' } }))).not.toMatch(/jane@|"x"/)
    const crumb = scrubBreadcrumb({
      category: 'http',
      data: { url: 'https://acc.r2.cloudflarestorage.com/b/outputs/u/j.png?X-Amz-Signature=abc', method: 'GET', status_code: 200 },
    })
    expect(crumb.data).toEqual({ url: 'https://acc.r2.cloudflarestorage.com/b/outputs/u/j.png', method: 'GET', status_code: 200 })
  })
})
