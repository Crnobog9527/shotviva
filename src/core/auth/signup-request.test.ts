import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { emailKey, requestSignup } = await import('./signup-request')

describe('emailKey', () => {
  it('hashes the trimmed, lower-cased address, as the hook does', () => {
    const expected = createHash('sha256').update('mei@example.com').digest('hex')
    expect(emailKey('  Mei@Example.COM ')).toBe(expected)
  })
})

describe('requestSignup', () => {
  it('passes the key and IP and parses the status', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'ip_daily', error: null })
    expect(await requestSignup({ rpc } as never, 'mei@example.com', null)).toBe('ip_daily')
    expect(rpc).toHaveBeenCalledWith('signup_request', { p_email_key: emailKey('mei@example.com'), p_ip: null })
  })

  it('throws on a database error or an unknown answer', async () => {
    await expect(requestSignup({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } }) } as never, 'a@b.c', null)).rejects.toThrow()
    await expect(requestSignup({ rpc: vi.fn().mockResolvedValue({ data: 'maybe', error: null }) } as never, 'a@b.c', null)).rejects.toThrow()
  })
})
