import { describe, expect, it, vi } from 'vitest'

vi.mock('../logger', () => ({ logger: { warn: vi.fn() } }))

const { isStaffSignup, staffJoinToken } = await import('./staff-signup')

const TOKEN = '0123456789abcdef0123456789abcdef'

function client(result: { data: unknown; error: { code: string } | null }) {
  const calls: unknown[][] = []
  const chain = {
    select: (...a: unknown[]) => (calls.push(['select', ...a]), chain),
    eq: (...a: unknown[]) => (calls.push(['eq', ...a]), chain),
    maybeSingle: async () => result,
  }
  return { db: { from: (t: string) => (calls.push(['from', t]), chain) } as never, calls }
}

describe('staffJoinToken', () => {
  it('reads the token of an org staff link in either language', () => {
    expect(staffJoinToken(`/join/org/${TOKEN}`)).toBe(TOKEN)
    expect(staffJoinToken(`/zh/join/org/${TOKEN}`)).toBe(TOKEN)
    expect(staffJoinToken(`/zh/join/org/${TOKEN}?x=1`)).toBe(TOKEN)
  })
  it('ignores everything else', () => {
    for (const next of [null, '', '/account', `/join/org/${TOKEN}/extra`, `/join/org/${TOKEN.toUpperCase()}`, `//evil/join/org/${TOKEN}`, '/join/org/abc'])
      expect(staffJoinToken(next)).toBeNull()
  })
})

describe('isStaffSignup', () => {
  it('counts only a token of an active org', async () => {
    const hit = client({ data: { id: 'o' }, error: null })
    expect(await isStaffSignup(hit.db, `/join/org/${TOKEN}`)).toBe(true)
    expect(hit.calls).toContainEqual(['eq', 'invite_token', TOKEN])
    expect(hit.calls).toContainEqual(['eq', 'status', 'active'])
    expect(await isStaffSignup(client({ data: null, error: null }).db, `/join/org/${TOKEN}`)).toBe(false)
  })
  it('keeps the gift when the lookup fails or there is no staff link', async () => {
    expect(await isStaffSignup(client({ data: null, error: { code: 'x' } }).db, `/join/org/${TOKEN}`)).toBe(false)
    expect(await isStaffSignup(client({ data: { id: 'o' }, error: null }).db, '/account')).toBe(false)
  })
})
