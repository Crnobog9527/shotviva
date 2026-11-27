import { generateKeyPairSync } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

const logged = vi.hoisted(() => [] as unknown[])

vi.mock('server-only', () => ({}))
vi.mock('../../logger', () => ({ logger: { error: (...args: unknown[]) => logged.push(args), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('./config', () => ({ waffoConfig: () => ({ merchantId: 'm', privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }) }))

const { isWaffoRejection, waffoClient } = await import('./client')

// A failed Waffo call logs the status and Waffo's error codes only: its message text can echo the
// buyer's company name or tax ID (#844).
describe('waffo client failure logging', () => {
  it('never logs Waffo\'s message text, and tags the error with the HTTP status', async () => {
    const body = { errors: [{ message: 'Invalid taxId 91310000MA1FL0000X for Acme Ltd', code: 'INVALID_TAX_ID' }, { message: 'x', extensions: { code: 'BAD_STATE' } }] }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status: 400 })) as unknown as typeof fetch
    const error = await waffoClient(fetcher).createCheckoutSession({} as never).catch((e: unknown) => e)
    expect(isWaffoRejection(error)).toBe(true)
    const text = JSON.stringify(logged)
    expect(text).not.toMatch(/91310000MA1FL0000X|Acme/)
    expect(text).toContain('INVALID_TAX_ID')
    expect(text).toContain('BAD_STATE')
  })

  it('a 5xx is not a rejection', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 503 })) as unknown as typeof fetch
    expect(isWaffoRejection(await waffoClient(fetcher).createCheckoutSession({} as never).catch((e: unknown) => e))).toBe(false)
  })
})
