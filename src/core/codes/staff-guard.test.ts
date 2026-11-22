import { describe, expect, it } from 'vitest'

import { staffNewUserCode } from './staff-guard'

type Row = { data: unknown; error: { message: string } | null }
function client(profile: Row, offer: Row) {
  const chain = (row: Row) => {
    const c = { select: () => c, eq: () => c, maybeSingle: async () => row }
    return c
  }
  return { from: (t: string) => chain(t === 'profiles' ? profile : offer) } as never
}
const staff = { data: { signup_gift_refusal: 'staff' }, error: null }
const normal = { data: { signup_gift_refusal: null }, error: null }

describe('staffNewUserCode', () => {
  it('refuses new_users_only and invite codes to a staff-link sign-up only', async () => {
    expect(await staffNewUserCode(client(staff, { data: { kind: 'campaign', new_users_only: true }, error: null }), 'u', 'WELCOME')).toBe(true)
    expect(await staffNewUserCode(client(staff, { data: { kind: 'invite', new_users_only: false }, error: null }), 'u', 'FRIEND')).toBe(true)
    expect(await staffNewUserCode(client(staff, { data: { kind: 'campaign', new_users_only: false }, error: null }), 'u', 'SALE')).toBe(false)
    expect(await staffNewUserCode(client(staff, { data: null, error: null }), 'u', 'NOPE')).toBe(false)
    expect(await staffNewUserCode(client(normal, { data: { kind: 'campaign', new_users_only: true }, error: null }), 'u', 'WELCOME')).toBe(false)
  })
  it('looks up no code for an ordinary account', async () => {
    const calls: string[] = []
    const c = { select: () => c, eq: () => c, maybeSingle: async () => normal }
    expect(await staffNewUserCode({ from: (t: string) => (calls.push(t), c) } as never, 'u', 'WELCOME')).toBe(false)
    expect(calls).toEqual(['profiles'])
  })
  it('fails closed when a lookup fails', async () => {
    await expect(staffNewUserCode(client({ data: null, error: { message: 'down' } }, { data: null, error: null }), 'u', 'X')).rejects.toMatchObject({ code: 'INTERNAL' })
  })
})
