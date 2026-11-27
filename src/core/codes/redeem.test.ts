import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../analytics', () => ({ track: mocks.track }))
import { redeemCode } from './redeem'

beforeEach(() => vi.clearAllMocks())

const admin = (data: unknown) => ({ rpc: vi.fn().mockResolvedValue({ data, error: null }) }) as never
const claim = { userId: 'u1', code: 'FRIEND12', context: 'account', invite: { windowDays: 7, inviterRewardCap: 20 }, locale: 'en' } as const

// 2030: the SQL reports an invite code after sign-up as new_users_only (for app code from before
// it) with reason signup_only; the route needs the real reason for its message.
it('turns new_users_only with reason signup_only into signup_only', async () => {
  const result = await redeemCode(admin({ kind: 'invite', status: 'new_users_only', reason: 'signup_only' }), claim)
  expect(result).toMatchObject({ kind: 'invite', status: 'signup_only' })
  expect(mocks.track).toHaveBeenCalledWith('code_redeem', expect.objectContaining({ status: 'signup_only', context: 'account' }), expect.anything())
})

it('leaves a plain new_users_only refusal as it is', async () => {
  expect(await redeemCode(admin({ kind: 'campaign', status: 'new_users_only' }), claim)).toMatchObject({ status: 'new_users_only' })
})

it('turns new_users_only with org_member into org_member (2032)', async () => {
  expect(await redeemCode(admin({ kind: 'campaign', status: 'new_users_only', org_member: true }), claim)).toMatchObject({ status: 'org_member' })
})
