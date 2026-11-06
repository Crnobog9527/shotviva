import { describe, expect, it } from 'vitest'

import { failureOf } from './use-delete-account'

// The delete sheet tells "Stripe would not cancel, nothing was deleted" apart from any other
// failure (ARCHITECTURE §13).
describe('failureOf', () => {
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })

  it('reads SUBSCRIPTION_CANCEL_FAILED as a subscription failure', async () => {
    expect(await failureOf(json({ code: 'SUBSCRIPTION_CANCEL_FAILED', message: 'x' }, 502))).toBe('subscription')
  })

  it('reads any other code, or no JSON at all, as a generic failure', async () => {
    expect(await failureOf(json({ code: 'INTERNAL', message: 'x' }, 500))).toBe('other')
    expect(await failureOf(new Response('<html>', { status: 504 }))).toBe('other')
  })
})
