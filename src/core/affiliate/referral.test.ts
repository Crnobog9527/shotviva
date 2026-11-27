import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), after: vi.fn(), rpc: vi.fn() }))
vi.mock('next/server', async (load) => ({ ...(await load<typeof import('next/server')>()), after: mocks.after }))
vi.mock('./feature', () => ({ isAffiliateEnabled: mocks.enabled }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
import { bindReferral, earliestReferral, recordReferral, storeSignupReferral, takeSignupReferral } from './referral'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue({ error: null })
})

async function visit(query: string, cookie = '') {
  const request = new NextRequest('https://example.test/zh/pricing' + query, { headers: { cookie } })
  const response = NextResponse.next()
  await recordReferral(request, response)
  return response.cookies.get('sv_ref')
}

it('sets a secure, host-only 60-day cookie and counts exactly the first touch after responding', async () => {
  const cookie = await visit('?ref=qa-anna')
  expect(cookie).toMatchObject({ value: expect.stringMatching(/^qa-anna\.\d+$/), secure: true, httpOnly: true, maxAge: 5184000, sameSite: 'lax', path: '/' })
  expect(cookie?.domain).toBeUndefined()
  expect(await visit('?ref=second', 'sv_ref=' + cookie?.value)).toBeUndefined()
  expect(mocks.after).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).not.toHaveBeenCalled()
  await mocks.after.mock.calls[0][0]()
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('affiliate_count_click', { p_slug: 'qa-anna' })
})

it('ignores absent, malformed and disabled referrals', async () => {
  for (const query of ['', '?ref=x', '?ref=UPPER', '?ref=a%20b']) expect(await visit(query)).toBeUndefined()
  expect(mocks.enabled).not.toHaveBeenCalled()
  mocks.enabled.mockResolvedValue(false)
  expect(await visit('?ref=anna')).toBeUndefined()
  expect(mocks.after).not.toHaveBeenCalled()
})

it('binds only a current cookie and isolates a failed RPC from auth and checkout', async () => {
  const time = Math.floor(Date.now() / 1000)
  for (const cookie of [undefined, 'bad', 'ABC.' + time, 'anna.' + (time - 5184000), 'anna.' + (time + 60)]) {
    await bindReferral('buyer', cookie, 'signup')
  }
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.rpc.mockRejectedValue(new Error())
  await bindReferral('buyer', 'anna.' + time, 'first_checkout')
  expect(mocks.rpc).toHaveBeenCalledWith('affiliate_bind', { p_user: 'buyer', p_slug: 'anna', p_source: 'first_checkout' })
})

// 2021: the cookie stored at email sign-up for a verification opened on another device.
it('stores only a current cookie for a real account, and never fails the sign-up', async () => {
  const time = Math.floor(Date.now() / 1000)
  for (const [user, cookie] of [[undefined, 'anna.' + time], ['u1', undefined], ['u1', 'bad'], ['u1', 'anna.' + (time - 5184000)]] as const) {
    await storeSignupReferral(user, cookie)
  }
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.rpc.mockRejectedValueOnce(new Error())
  await storeSignupReferral('u1', 'anna.' + time)
  mocks.rpc.mockResolvedValueOnce({ error: { code: '42501' } })
  await storeSignupReferral('u1', 'anna.' + time)
  expect(mocks.rpc).toHaveBeenCalledWith('affiliate_signup_ref_store', { p_user: 'u1', p_ref: 'anna.' + time })
})

it('takes the stored referral once, and reads a failure as none', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: 'anna.123', error: null })
  expect(await takeSignupReferral('u1')).toBe('anna.123')
  expect(mocks.rpc).toHaveBeenCalledWith('affiliate_signup_ref_take', { p_user: 'u1' })
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
  expect(await takeSignupReferral('u1')).toBeUndefined()
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000' } })
  expect(await takeSignupReferral('u1')).toBeUndefined()
  mocks.rpc.mockRejectedValueOnce(new Error())
  expect(await takeSignupReferral('u1')).toBeUndefined()
})

it('keeps the referral set first, ignoring malformed and expired ones', () => {
  const time = Math.floor(Date.now() / 1000)
  const older = 'anna.' + (time - 100)
  const newer = 'bob.' + (time - 10)
  expect(earliestReferral(newer, older)).toBe(older)
  expect(earliestReferral(older, newer)).toBe(older)
  expect(earliestReferral(undefined, newer)).toBe(newer)
  expect(earliestReferral('anna.' + (time - 5184000), newer)).toBe(newer)
  expect(earliestReferral('bad', null, undefined)).toBeUndefined()
})
