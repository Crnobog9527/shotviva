import { beforeEach, describe, expect, it, vi } from 'vitest'

const transfer = vi.hoisted(() => vi.fn())
vi.mock('@/core/org', () => ({ adminTransferOrgOwner: transfer, PAYMENT_KINDS: ['overseas_us'], PAYMENT_FIELDS: { overseas_us: [] }, ORG_SIGNUP_BONUS_MAX: 1000 }))
vi.mock('@/core/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const { transferOrgOwner } = await import('./transfer-owner')
const { orgFailure } = await import('./commands')
const { TRANSFER_COPY } = await import('./transfer-copy')
const { AppError } = await import('@/core/errors')
const { toRpcError } = await import('@/core/billing/rpc')
const { transferBlocked } = await import('../orgs-ui/transfer-owner-form')

const deps = { db: {} as never, actor: '00000000-0000-4000-8000-0000000000aa' }
const ORG = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const input = { orgId: ORG, userId: USER, expectedUpdatedAt: '2026-01-01T00:00:00Z' }

beforeEach(() => { vi.resetAllMocks() })

describe('transferOrgOwner', () => {
  it('passes the org, the new owner and the page version to the SQL and reports what moved', async () => {
    transfer.mockResolvedValue({ applied: true, updated_at: 'x', previous_owner: USER, affiliate: { commissions: 3, payouts: 1, adjustments: 0, customers: 2 } })
    const result = await transferOrgOwner(deps, input)
    expect(transfer).toHaveBeenCalledWith(deps.db, deps.actor, ORG, USER, input.expectedUpdatedAt)
    expect(result).toEqual({ ok: true, message: TRANSFER_COPY.done({ commissions: 3, customers: 2 }), value: { applied: true } })
  })

  it('says a repeat changed nothing', async () => {
    transfer.mockResolvedValue({ applied: false })
    expect(await transferOrgOwner(deps, input)).toEqual({ ok: true, message: TRANSFER_COPY.already, value: { applied: false } })
  })

  it('rejects malformed input before calling the SQL', async () => {
    await expect(transferOrgOwner(deps, { ...input, userId: 'nope' })).rejects.toThrow()
    expect(transfer).not.toHaveBeenCalled()
  })

  it('maps the affiliate-row collision and a busy org to their messages', () => {
    expect(orgFailure(new AppError('INTERNAL', 'ORG_NEW_OWNER_AFFILIATE'))).toEqual({ ok: false, message: TRANSFER_COPY.newOwnerAffiliate })
    expect(orgFailure(new AppError('INTERNAL', 'ORG_BUSY'))).toEqual({ ok: false, message: TRANSFER_COPY.busy })
  })

  // Production 2026-11-23: the SQL codes reached the form as the generic failure because the RPC
  // layer did not know them.
  it('maps each refusal the SQL raises, through the RPC layer, to its own message', () => {
    const via = (message: string) => orgFailure(toRpcError('admin_org_transfer_owner', { message, code: 'P0001' }))
    expect(via('ORG_NEW_OWNER_AFFILIATE_HISTORY')).toEqual({ ok: false, message: TRANSFER_COPY.newOwnerAffiliateHistory })
    expect(TRANSFER_COPY.newOwnerAffiliateHistory).toBe('这个账号已有个人推广员账户且有推广记录，不能直接接任主管理员')
    expect(via('ORG_NEW_OWNER_AFFILIATE')).toEqual({ ok: false, message: TRANSFER_COPY.newOwnerAffiliate })
    expect(via('ORG_AFFILIATE_MISMATCH')).toEqual({ ok: false, message: TRANSFER_COPY.affiliateMismatch })
    expect(via('ORG_BUSY')).toEqual({ ok: false, message: TRANSFER_COPY.busy })
  })

  it('reports a deleted empty personal affiliate account', async () => {
    transfer.mockResolvedValue({ applied: true, updated_at: 'x', previous_owner: USER, affiliate: { commissions: 0, payouts: 0, adjustments: 0, customers: 0 }, removed_personal: { slug: 'abc', status: 'suspended' } })
    const result = await transferOrgOwner(deps, input)
    expect(result.message).toContain('abc')
    expect(result.message).toContain('已删除')
  })
})

describe('transferBlocked', () => {
  const OWNER = '33333333-3333-4333-8333-333333333333'
  const user = (over: Record<string, unknown>) => ({
    id: USER, email: 'u@example.com', phone: null, createdAt: 'x', tier: null, status: 'ok', orgName: null, orgRole: null, affiliateHistory: false, ...over,
  }) as never
  const blocked = transferBlocked(OWNER)
  it('lets an empty personal affiliate account through and stops one with history', () => {
    expect(blocked(user({ status: 'personal_affiliate' }))).toBeNull()
    expect(blocked(user({ status: 'ok', affiliateHistory: true }))).toBe(TRANSFER_COPY.pickerHistory)
    expect(blocked(user({ status: 'in_this_org', affiliateHistory: true }))).toBe(TRANSFER_COPY.pickerHistory)
    expect(blocked(user({ status: 'in_this_org' }))).toBeNull()
  })
  it('keeps the other reasons', () => {
    expect(blocked(user({ id: OWNER }))).toBe(TRANSFER_COPY.current)
    expect(blocked(user({ status: 'banned' }))).toContain('封禁')
    expect(blocked(user({ status: 'in_org', orgName: 'X', orgRole: 'member' }))).toContain('X')
  })
})
