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
  const client = (rows: { id: string }[]) => {
    const select = vi.fn().mockResolvedValue({ data: rows, error: null })
    const is = vi.fn(() => ({ select }))
    const eq = vi.fn(() => ({ is }))
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    return { from, update, eq, is }
  }

  it('only fills an empty signup_ip, and says whether it did', async () => {
    const first = client([{ id: 'u1' }])
    expect(await recordSignupIp({ from: first.from } as never, 'u1', '203.0.113.7')).toBe(true)
    expect(first.from).toHaveBeenCalledWith('profiles')
    expect(first.update).toHaveBeenCalledWith({ signup_ip: '203.0.113.7' })
    expect(first.eq).toHaveBeenCalledWith('id', 'u1')
    expect(first.is).toHaveBeenCalledWith('signup_ip', null)
    // Already recorded: the update matches no row.
    expect(await recordSignupIp({ from: client([]).from } as never, 'u1', '203.0.113.7')).toBe(false)
  })

  it('does nothing without an address', async () => {
    const from = vi.fn()
    expect(await recordSignupIp({ from } as never, 'u1', null)).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })
})
