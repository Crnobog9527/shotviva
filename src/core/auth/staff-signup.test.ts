import { describe, expect, it, vi } from 'vitest'

vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const { isStaffSignup, markStaffSignup, staffSignup, staffJoinToken, staffOriginFor, staffSignupData } = await import('./staff-signup')

const TOKEN = '0123456789abcdef0123456789abcdef'
const ORG = '11111111-2222-4333-8444-555555555555'

type Answer = { data: unknown; error: { code: string } | null }
// orgs lookups: `answer` for every query, or per column (the first .eq of each query).
function client(answer: Answer | ((column: string, value: unknown) => Answer)) {
  const calls: unknown[][] = []
  const from = (t: string) => {
    calls.push(['from', t])
    let first: [string, unknown] | null = null
    const chain = {
      select: (...a: unknown[]) => (calls.push(['select', ...a]), chain),
      eq: (column: string, value: unknown) => (calls.push(['eq', column, value]), (first ??= [column, value]), chain),
      maybeSingle: async () => (typeof answer === 'function' ? answer(...first!) : answer),
    }
    return chain
  }
  return { db: { from } as never, calls }
}
const found = { data: { id: ORG }, error: null }
const missing = { data: null, error: null }
const failed = { data: null, error: { code: 'x' } }

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

// Codex P1 (#841): the origin stored at sign-up survives a confirmation resent from /login.
describe('staffOriginFor', () => {
  it('reads the token from next, else the stored one, plus the stored org id', () => {
    expect(staffOriginFor(`/zh/join/org/${TOKEN}`, { user_metadata: {} })).toEqual({ token: TOKEN, orgId: null })
    expect(staffOriginFor('/account', { user_metadata: { staff_invite: TOKEN, staff_org: ORG } })).toEqual({ token: TOKEN, orgId: ORG })
    expect(staffOriginFor('/account', { user_metadata: { staff_org: ORG } })).toEqual({ token: null, orgId: ORG })
    expect(staffOriginFor('/account', { user_metadata: {} })).toBeNull()
    expect(staffOriginFor('/account', { user_metadata: null })).toBeNull()
    expect(staffOriginFor('/account', { user_metadata: { staff_invite: 'nope', staff_org: 42 } })).toBeNull()
  })
})

describe('staffSignupData', () => {
  it('stores the token and the active org of a staff link, nothing for other links', async () => {
    expect(await staffSignupData(client(found).db, `/zh/join/org/${TOKEN}`)).toEqual({ staff_invite: TOKEN, staff_org: ORG })
    expect(await staffSignupData(client(missing).db, `/join/org/${TOKEN}`)).toEqual({})
    expect(await staffSignupData(client(found).db, '/account')).toEqual({})
  })
  it('stores the token alone when the lookup fails, so the sign-in checks again', async () => {
    expect(await staffSignupData(client(failed).db, `/join/org/${TOKEN}`)).toEqual({ staff_invite: TOKEN })
  })
})

describe('isStaffSignup', () => {
  it('counts an active org found by the stored org id, so a link reset since still counts', async () => {
    const hit = client((column) => (column === 'id' ? found : missing))
    expect(await isStaffSignup(hit.db, { token: TOKEN, orgId: ORG })).toBe(true)
    expect(hit.calls).toContainEqual(['eq', 'id', ORG])
    expect(hit.calls).toContainEqual(['eq', 'status', 'active'])
  })
  it('falls back to the token of an active org', async () => {
    const hit = client((column) => (column === 'invite_token' ? found : missing))
    expect(await isStaffSignup(hit.db, { token: TOKEN, orgId: ORG })).toBe(true)
    expect(await isStaffSignup(hit.db, { token: TOKEN, orgId: null })).toBe(true)
    expect(await isStaffSignup(client(missing).db, { token: TOKEN, orgId: ORG })).toBe(false)
    expect(await isStaffSignup(client(found).db, null)).toBe(false)
  })
  it("answers 'error' when a lookup fails, so no gift is paid on that sign-in", async () => {
    expect(await isStaffSignup(client(failed).db, { token: TOKEN, orgId: null })).toBe('error')
    expect(await isStaffSignup(client(failed).db, { token: null, orgId: ORG })).toBe('error')
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
  const origin = { token: TOKEN, orgId: null }
  const db = (org: Answer, mark: Answer) => {
    const rpc = vi.fn().mockResolvedValue(mark)
    return { db: { ...(client(org).db as object), rpc } as never, rpc }
  }
  it('is a staff sign-up only when it points at an active org and is marked', async () => {
    const hit = db(found, { data: true, error: null })
    expect(await staffSignup(hit.db, 'u1', origin)).toBe(true)
    expect(hit.rpc).toHaveBeenCalledOnce()
    const none = db(found, { data: true, error: null })
    expect(await staffSignup(none.db, 'u1', null)).toBe(false)
    expect(await staffSignup(db(missing, { data: true, error: null }).db, 'u1', origin)).toBe(false)
    expect(none.rpc).not.toHaveBeenCalled()
  })
  // Codex P1 (#841): an existing account the SQL declines to mark (paid, pending, older) keeps its gift.
  it('is not a staff sign-up when the SQL declines the account', async () => {
    expect(await staffSignup(db(found, { data: false, error: null }).db, 'u1', origin)).toBe(false)
  })
  it('pays nothing on this sign-in when the mark fails', async () => {
    expect(await staffSignup(db(found, failed).db, 'u1', origin)).toBe(true)
  })
  it('pays nothing, and marks nothing, when the org lookup fails', async () => {
    const broken = db(failed, { data: true, error: null })
    expect(await staffSignup(broken.db, 'u1', origin)).toBe('unchecked')
    expect(broken.rpc).not.toHaveBeenCalled()
  })
})
