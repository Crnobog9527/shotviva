import { describe, expect, it, vi } from 'vitest'

vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const { isStaffSignup, markStaffSignup, staffSignup, staffJoinToken, staffInviteOf, staffTokenFor } = await import('./staff-signup')

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

// Codex P1 (#841): the token stored at sign-up survives a confirmation resent from /login.
describe('staffTokenFor', () => {
  it('reads the token from next, else from the one stored at sign-up', () => {
    const stored = { user_metadata: { staff_invite: TOKEN } }
    expect(staffTokenFor(`/zh/join/org/${TOKEN}`, { user_metadata: {} })).toBe(TOKEN)
    expect(staffTokenFor('/account', stored)).toBe(TOKEN)
    expect(staffTokenFor('/account', { user_metadata: {} })).toBeNull()
    expect(staffTokenFor('/account', { user_metadata: null })).toBeNull()
    expect(staffInviteOf({ user_metadata: { staff_invite: 'nope' } })).toBeNull()
    expect(staffInviteOf({ user_metadata: { staff_invite: 42 } })).toBeNull()
  })
})

describe('isStaffSignup', () => {
  it('counts only a token of an active org', async () => {
    const hit = client({ data: { id: 'o' }, error: null })
    expect(await isStaffSignup(hit.db, TOKEN)).toBe(true)
    expect(hit.calls).toContainEqual(['eq', 'invite_token', TOKEN])
    expect(hit.calls).toContainEqual(['eq', 'status', 'active'])
    expect(await isStaffSignup(client({ data: null, error: null }).db, TOKEN)).toBe(false)
  })
  it('keeps the gift when the lookup fails or there is no staff link', async () => {
    expect(await isStaffSignup(client({ data: null, error: { code: 'x' } }).db, TOKEN)).toBe(false)
    expect(await isStaffSignup(client({ data: { id: 'o' }, error: null }).db, null)).toBe(false)
  })
})

describe('markStaffSignup', () => {
  it('answers what the SQL function did and never throws', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'x' } })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'x' } })
      .mockResolvedValueOnce({ data: null, error: { code: 'x' } })
    expect(await markStaffSignup({ rpc } as never, 'u1')).toBe(true)
    expect(await markStaffSignup({ rpc } as never, 'u1')).toBe(false)
    // One failure is retried; two give up.
    expect(await markStaffSignup({ rpc } as never, 'u1')).toBe(true)
    expect(await markStaffSignup({ rpc } as never, 'u1')).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(6)
    expect(rpc).toHaveBeenCalledWith('mark_staff_signup', { p_user_id: 'u1' })
  })
})

describe('staffSignup', () => {
  const db = (org: boolean, mark: { data: unknown; error: { code: string } | null }) => {
    const rpc = vi.fn().mockResolvedValue(mark)
    return { db: { ...(client({ data: org ? { id: 'o' } : null, error: null }).db as object), rpc } as never, rpc }
  }
  it('is a staff sign-up only when headed for an active org staff link and marked', async () => {
    const hit = db(true, { data: true, error: null })
    expect(await staffSignup(hit.db, 'u1', TOKEN)).toBe(true)
    expect(hit.rpc).toHaveBeenCalledOnce()
    const none = db(true, { data: true, error: null })
    expect(await staffSignup(none.db, 'u1', null)).toBe(false)
    expect(await staffSignup(db(false, { data: true, error: null }).db, 'u1', TOKEN)).toBe(false)
    expect(none.rpc).not.toHaveBeenCalled()
  })
  // Codex P1 (#841): an existing account the SQL declines to mark (paid, pending, older) keeps its gift.
  it('is not a staff sign-up when the SQL declines the account', async () => {
    expect(await staffSignup(db(true, { data: false, error: null }).db, 'u1', TOKEN)).toBe(false)
  })
  it('pays nothing on this sign-in when the mark fails', async () => {
    expect(await staffSignup(db(true, { data: null, error: { code: 'x' } }).db, 'u1', TOKEN)).toBe(true)
  })
})
