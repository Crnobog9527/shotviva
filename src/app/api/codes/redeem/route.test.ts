import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'
import { appOrigin } from '@/core/site-url'
import { POST } from './route'

const mocks = vi.hoisted(() => ({ session: vi.fn(), redeem: vi.fn(), rpc: vi.fn() }))
vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.session }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/core/codes/server', () => ({ redeemCode: mocks.redeem }))

const user = { id: 'u1', role: 'user', locale: 'zh', verified: true, banned: false }

function post(body: string, origin = appOrigin) {
  return POST(new NextRequest(appOrigin + '/api/codes/redeem', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body,
  }))
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue(user)
  mocks.rpc.mockResolvedValue({ data: { status: 'invalid_input' }, error: null })
})

it('requires the correct origin, a verified session and an unbanned account before processing a code', async () => {
  expect((await post('{}', 'https://elsewhere.test')).status).toBe(403)
  expect(mocks.session).not.toHaveBeenCalled()
  mocks.session.mockResolvedValueOnce(null)
  expect((await post('{}')).status).toBe(401)
  for (const profile of [{ ...user, verified: false }, { ...user, banned: true }]) {
    mocks.session.mockResolvedValueOnce(profile)
    expect((await post('{}')).status).toBe(403)
  }
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.redeem).not.toHaveBeenCalled()
})

it.each(['{', '{}', '{"code":"bad!"}', '{"code":"GIFT","replace":"true"}', '{"code":"GIFT","userId":"other"}',
  '{"code":"GIFT","context":"signup"}'])('accounts for malformed requests once without passing the code: %s', async (body) => {
  const response = await post(body)
  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({ code: 'INVALID_INPUT' })
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('redeem_limited_code', expect.objectContaining({ p_user: user.id, p_code: null }))
  expect(mocks.redeem).not.toHaveBeenCalled()
})

it('over-budget malformed requests return 429', async () => {
  mocks.rpc.mockResolvedValue({ data: { status: 'rate_limited' }, error: null })
  expect((await post('{}')).status).toBe(429)
})

it('passes the authenticated user, normalized code, context and explicit replacement once', async () => {
  const success = { status: 'ok', kind: 'campaign', credits: 5, pool: 'paid', percent: null }
  mocks.redeem.mockResolvedValue(success)
  const response = await post('{"code":"gIfT","context":"paywall","replace":true}')
  expect(await response.json()).toEqual(success)
  expect(mocks.redeem).toHaveBeenCalledExactlyOnceWith(expect.anything(),
    expect.objectContaining({ userId: user.id, code: 'GIFT', context: 'paywall', replace: true, locale: 'zh' }))
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(response.headers.get('cache-control')).toContain('no-store')
})

it.each([
  ['not_found', 'CODE_NOT_FOUND', 404], ['expired', 'CODE_EXPIRED', 410], ['full', 'CODE_FULL', 409],
  ['used', 'CODE_USED', 409], ['own', 'CODE_OWN', 422], ['new_users_only', 'CODE_NEW_USERS_ONLY', 403],
  ['already_invited', 'CODE_ALREADY_INVITED', 409], ['checkout_in_progress', 'CODE_CHECKOUT_IN_PROGRESS', 409],
  ['blocked_same_ip', 'CODE_INVITE_INELIGIBLE', 403], ['blocked_no_signup_grant', 'CODE_INVITE_INELIGIBLE', 403],
  ['banned', 'FORBIDDEN', 403], ['rate_limited', 'RATE_LIMITED', 429],
])('maps %s to stable client error %s', async (status, code, http) => {
  mocks.redeem.mockResolvedValue({ status })
  const response = await post('{"code":"GIFT"}')
  expect(response.status).toBe(http)
  expect(await response.json()).toEqual({ code, message: expect.any(String) })
})

it('names the old discount when replacement requires confirmation', async () => {
  mocks.redeem.mockResolvedValue({ status: 'needs_confirm', currentCode: 'OLD20' })
  const response = await post('{"code":"GIFT"}')
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ code: 'CODE_NEEDS_CONFIRM', message: expect.any(String), currentCode: 'OLD20' })
})

it('propagates service failures without a successful claim', async () => {
  mocks.redeem.mockRejectedValue(new AppError('FORBIDDEN', 'Account unavailable'))
  expect((await post('{"code":"GIFT"}')).status).toBe(403)
})
