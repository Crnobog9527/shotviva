import { beforeEach, describe, expect, it, vi } from 'vitest'

const transfer = vi.hoisted(() => vi.fn())
vi.mock('@/core/org', () => ({ adminTransferOrgOwner: transfer, PAYMENT_KINDS: ['overseas_us'], PAYMENT_FIELDS: { overseas_us: [] }, ORG_SIGNUP_BONUS_MAX: 1000 }))
vi.mock('@/core/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const { transferOrgOwner } = await import('./transfer-owner')
const { orgFailure } = await import('./commands')
const { TRANSFER_COPY } = await import('./transfer-copy')
const { AppError } = await import('@/core/errors')

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

  it('maps the affiliate-row collision to its message', () => {
    expect(orgFailure(new AppError('INTERNAL', 'ORG_NEW_OWNER_AFFILIATE'))).toEqual({ ok: false, message: TRANSFER_COPY.newOwnerAffiliate })
  })
})
