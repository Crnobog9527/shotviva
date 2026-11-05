import { describe, expect, it, vi } from 'vitest'

import { clientIp, recordSignupIp } from './signup-ip'

const headers = (values: Record<string, string>) => new Headers(values)

describe('clientIp', () => {
  it('takes the first forwarded hop', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip and accepts IPv6', () => {
    expect(clientIp(headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1')
  })

  it('rejects anything that is not an IP', () => {
    expect(clientIp(headers({ 'x-forwarded-for': 'not-an-ip' }))).toBeNull()
    expect(clientIp(headers({}))).toBeNull()
  })
})

describe('recordSignupIp', () => {
  it('only fills an empty signup_ip', async () => {
    const is = vi.fn().mockResolvedValue({ error: null })
    const eq = vi.fn(() => ({ is }))
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    await recordSignupIp({ from } as never, 'u1', '203.0.113.7')
    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ signup_ip: '203.0.113.7' })
    expect(eq).toHaveBeenCalledWith('id', 'u1')
    expect(is).toHaveBeenCalledWith('signup_ip', null)
  })

  it('does nothing without an address', async () => {
    const from = vi.fn()
    await recordSignupIp({ from } as never, 'u1', null)
    expect(from).not.toHaveBeenCalled()
  })
})
