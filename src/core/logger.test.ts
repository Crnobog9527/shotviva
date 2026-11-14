import { afterEach, describe, expect, it, vi } from 'vitest'

import { logger, redact, redactString } from './logger'

describe('redaction', () => {
  it('masks emails, bearer tokens, JWTs and provider keys in strings', () => {
    const input =
      'user a.b@example.com sent Bearer abc.def-123 with sk_live_1234567890abcdef and eyJhbGc.eyJzdWI.sig'
    const output = redactString(input)
    expect(output).not.toMatch(/example\.com|abc\.def|sk_live|eyJ/)
  })

  it('masks values under sensitive keys at any depth', () => {
    const output = redact({ user: { password: 'p', apiKey: 'k' }, ok: 1 })
    expect(output).toEqual({ user: { password: '[redacted]', apiKey: '[redacted]' }, ok: 1 })
  })
})

describe('phone sign-in redaction (T63)', () => {
  it('masks mainland numbers in any spelling and anything under an otp key', () => {
    expect(redactString('to 14000000001, +8614000000001 and 8614000000001')).toBe('to [phone], [phone] and [phone]')
    expect(redactString('job 1762500000000 cost 2')).toBe('job 1762500000000 cost 2')
    expect(redact({ sms: { otp: '402913' }, phone: '140****0001' })).toEqual({ sms: { otp: '[redacted]' }, phone: '140****0001' })
  })
})

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks())

  it('writes one redacted JSON line', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('login for a@b.co', { token: 'secret-value' })
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]))
    expect(line).toMatchObject({ level: 'info', msg: 'login for [email]', token: '[redacted]' })
  })
})
