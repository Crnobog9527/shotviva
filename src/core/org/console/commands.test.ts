import { beforeEach, describe, expect, it, vi } from 'vitest'

const sql = vi.hoisted(() => ({
  allocate: vi.fn(), deposit: vi.fn(), join: vi.fn(), leave: vi.fn(), remove: vi.fn(), rotate: vi.fn(), allowance: vi.fn(),
}))
vi.mock('../actions', () => ({
  allocateOrgCredits: sql.allocate, depositOrgCredits: sql.deposit, joinOrg: sql.join, leaveOrg: sql.leave,
  removeOrgMember: sql.remove, rotateOrgInvite: sql.rotate, setOrgAllowance: sql.allowance,
}))
const promo = vi.hoisted(() => ({ allocate: vi.fn(), allowance: vi.fn() }))
vi.mock('../promo-actions', () => ({ allocateOrgPromoCredits: promo.allocate, setOrgPromoAllowance: promo.allowance }))
vi.mock('@/core/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const { allocate, allocatePromo, deposit, join, leave, removeMember, resetInvite, setAllowance, setPromoAllowance } = await import('./commands')
const { AppError } = await import('@/core/errors')

const USER = '00000000-0000-4000-8000-0000000000a1'
const MEMBER = '00000000-0000-4000-8000-0000000000b2'
const ORG = '11111111-1111-4111-8111-111111111111'
const FORM = 'f0f0f0f0-aaaa-4bbb-8ccc-123456789012'

// The org the signed-in account owns, or none (null): the only database read the commands make.
function db(owned: string | null) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: owned ? { id: owned } : null, error: null }) }
  return { from: vi.fn(() => chain) } as never
}
const owner = () => ({ db: db(ORG), user: USER })
const sqlError = (message: string) => new AppError('CONFLICT', message, { cause: new Error(message) })

beforeEach(() => vi.resetAllMocks())

describe('owner commands', () => {
  it('refuse an account that owns no org before calling any SQL function', async () => {
    const stranger = { db: db(null), user: USER }
    const results = await Promise.all([
      allocate(stranger, { requestId: FORM, member: MEMBER, credits: 10 }),
      setAllowance(stranger, { member: MEMBER, allowance: 10 }),
      deposit(stranger, { requestId: FORM, credits: 10 }),
      removeMember(stranger, { requestId: FORM, member: MEMBER }),
      resetInvite(stranger),
    ])
    for (const result of results) expect(result).toEqual({ ok: false, error: 'NOT_OWNER' })
    for (const fn of [sql.allocate, sql.allowance, sql.deposit, sql.remove, sql.rotate]) expect(fn).not.toHaveBeenCalled()
  })

  it('takes the owner id from the session and namespaces the form id with the org, the same on every retry', async () => {
    sql.allocate.mockResolvedValue({ applied: true, pool_credits: 90, held_credits: 10 })
    const input = { requestId: FORM, member: MEMBER, credits: '10' }
    const first = await allocate(owner(), input)
    const retry = await allocate(owner(), input)
    expect(first).toEqual({ ok: true, pool: 90 })
    expect(retry).toEqual(first)
    expect(sql.allocate).toHaveBeenNthCalledWith(1, expect.anything(), USER, MEMBER, 10, `console:allocate:${ORG}:${FORM}`)
    expect(sql.allocate.mock.calls[1]?.slice(1)).toEqual(sql.allocate.mock.calls[0]?.slice(1))
  })

  it('moves promotion credits under their own request id, and refuses a non-owner before any SQL', async () => {
    promo.allocate.mockResolvedValue({ applied: true, promo_pool_credits: 700, held_promo_credits: 300 })
    promo.allowance.mockResolvedValue(2000)
    expect(await allocatePromo(owner(), { requestId: FORM, member: MEMBER, credits: '300' })).toEqual({ ok: true, pool: 700 })
    expect(promo.allocate).toHaveBeenCalledWith(expect.anything(), USER, MEMBER, 300, `console:allocate_promo:${ORG}:${FORM}`)
    expect(await setPromoAllowance(owner(), { member: MEMBER, allowance: '2000' })).toEqual({ ok: true, allowance: 2000 })
    const stranger = { db: db(null), user: USER }
    expect(await allocatePromo(stranger, { requestId: FORM, member: MEMBER, credits: 1 })).toEqual({ ok: false, error: 'NOT_OWNER' })
    expect(await setPromoAllowance(stranger, { member: MEMBER, allowance: 1 })).toEqual({ ok: false, error: 'NOT_OWNER' })
    expect(promo.allocate).toHaveBeenCalledTimes(1)
    promo.allocate.mockRejectedValue(sqlError('ORG_POOL_INSUFFICIENT'))
    expect(await allocatePromo(owner(), { requestId: FORM, member: MEMBER, credits: 1 })).toEqual({ ok: false, error: 'POOL_INSUFFICIENT' })
  })

  it('uses a different SQL request id per kind of action', async () => {
    sql.deposit.mockResolvedValue({ applied: true, pool_credits: 5 })
    sql.remove.mockResolvedValue(3)
    await deposit(owner(), { requestId: FORM, credits: 5 })
    await removeMember(owner(), { requestId: FORM, member: MEMBER })
    expect(sql.deposit).toHaveBeenCalledWith(expect.anything(), USER, 5, `console:deposit:${ORG}:${FORM}`)
    expect(sql.remove).toHaveBeenCalledWith(expect.anything(), USER, MEMBER, `console:remove:${ORG}:${FORM}`)
  })

  it.each([
    { credits: 0 }, { credits: -4 }, { credits: 1.5 }, { credits: 'abc' }, { credits: 1e12 },
  ])('rejects the amount %j without touching the database', async (bad) => {
    expect(await allocate(owner(), { requestId: FORM, member: MEMBER, ...bad })).toEqual({ ok: false, error: 'INVALID' })
    expect(await deposit(owner(), { requestId: FORM, ...bad })).toEqual({ ok: false, error: 'INVALID' })
    expect(sql.allocate).not.toHaveBeenCalled()
    expect(sql.deposit).not.toHaveBeenCalled()
  })

  it('rejects a missing or short request id and a member id that is not a uuid', async () => {
    expect(await allocate(owner(), { requestId: 'x', member: MEMBER, credits: 5 })).toEqual({ ok: false, error: 'INVALID' })
    expect(await allocate(owner(), { requestId: FORM, member: 'someone', credits: 5 })).toEqual({ ok: false, error: 'INVALID' })
    expect(sql.allocate).not.toHaveBeenCalled()
  })

})

describe('owner command answers', () => {
  it('says why a movement did not apply', async () => {
    sql.allocate.mockRejectedValueOnce(sqlError('ORG_POOL_INSUFFICIENT'))
    sql.deposit.mockRejectedValueOnce(sqlError('CREDITS_INSUFFICIENT'))
    sql.remove.mockRejectedValueOnce(sqlError('ORG_OWNER_CANNOT_LEAVE'))
    sql.allocate.mockRejectedValueOnce(sqlError('ORG_SUSPENDED'))
    sql.allocate.mockRejectedValueOnce(sqlError('IDEMPOTENCY_CONFLICT'))
    expect(await allocate(owner(), { requestId: FORM, member: MEMBER, credits: 5 })).toEqual({ ok: false, error: 'POOL_INSUFFICIENT' })
    expect(await deposit(owner(), { requestId: FORM, credits: 5 })).toEqual({ ok: false, error: 'CREDITS_INSUFFICIENT' })
    expect(await removeMember(owner(), { requestId: FORM, member: MEMBER })).toEqual({ ok: false, error: 'OWNER_CANNOT_LEAVE' })
    expect(await allocate(owner(), { requestId: FORM, member: MEMBER, credits: 5 })).toEqual({ ok: false, error: 'SUSPENDED' })
    expect(await allocate(owner(), { requestId: FORM, member: MEMBER, credits: 5 })).toEqual({ ok: false, error: 'CONFLICT' })
  })

  it('answers FAILED for an unexpected error and never leaks its text', async () => {
    sql.rotate.mockRejectedValue(new Error('connection reset by peer at 10.0.0.1'))
    const result = await resetInvite(owner())
    expect(result).toEqual({ ok: false, error: 'FAILED' })
  })

  it('sets the allowance and resets the invite link', async () => {
    sql.allowance.mockResolvedValue(500)
    sql.rotate.mockResolvedValue('a'.repeat(32))
    expect(await setAllowance(owner(), { member: MEMBER, allowance: '500' })).toEqual({ ok: true, allowance: 500 })
    expect(sql.allowance).toHaveBeenCalledWith(expect.anything(), USER, MEMBER, 500)
    expect(await resetInvite(owner())).toEqual({ ok: true, token: 'a'.repeat(32) })
    expect(await setAllowance(owner(), { member: MEMBER, allowance: -1 })).toEqual({ ok: false, error: 'INVALID' })
  })
})

describe('member commands', () => {
  it('leave uses the signed-in account only and a per-form request id', async () => {
    sql.leave.mockResolvedValue(40)
    const result = await leave({ db: db(null), user: USER }, { requestId: FORM, user: MEMBER })
    expect(result).toEqual({ ok: true, reclaimed: 40 })
    expect(sql.leave).toHaveBeenCalledWith(expect.anything(), USER, `console:leave:${USER}:${FORM}`)
  })

  it('leave by the owner is refused by the SQL function and reported as such', async () => {
    sql.leave.mockRejectedValue(sqlError('ORG_OWNER_CANNOT_LEAVE'))
    expect(await leave(owner(), { requestId: FORM })).toEqual({ ok: false, error: 'OWNER_CANNOT_LEAVE' })
  })

  it.each([
    ['ORG_INVITE_INVALID', 'INVITE_INVALID'],
    ['ORG_SUSPENDED', 'SUSPENDED'],
    ['ORG_MEMBER_EXISTS', 'ALREADY_IN_ORG'],
    ['ORG_PERSONAL_AFFILIATE', 'PERSONAL_AFFILIATE'],
    ['ORG_PERSONAL_AFFILIATE_UNSETTLED', 'PERSONAL_AFFILIATE_UNSETTLED'],
    ['USER_BANNED', 'BANNED'],
  ])('join: %s is shown as %s', async (message, expected) => {
    sql.join.mockRejectedValue(sqlError(message))
    expect(await join({ db: db(null), user: USER }, 'a'.repeat(32))).toEqual({ ok: false, error: expected })
  })

  it('join passes the signed-in account and the token', async () => {
    sql.join.mockResolvedValue(ORG)
    expect(await join({ db: db(null), user: USER }, 'b'.repeat(32))).toEqual({ ok: true })
    expect(sql.join).toHaveBeenCalledWith(expect.anything(), USER, 'b'.repeat(32))
  })
})
