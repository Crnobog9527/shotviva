import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), after: vi.fn(), rpc: vi.fn() }))
vi.mock('next/server', async (load) => ({ ...(await load<typeof import('next/server')>()), after: mocks.after }))
vi.mock('./feature', () => ({ isAffiliateEnabled: mocks.enabled }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
import { bindReferral, bindSignupReferral, recordReferral, storeSignupReferral } from './referral'

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

it('sets a secure, host-only 15-day cookie and counts exactly the first touch after responding', async () => {
  const cookie = await visit('?ref=qa-anna')
  expect(cookie).toMatchObject({ value: expect.stringMatching(/^qa-anna\.\d+$/), secure: true, httpOnly: true, maxAge: 1296000, sameSite: 'lax', path: '/' })
  expect(cookie?.domain).toBeUndefined()
  expect(await visit('?ref=second', 'sv_ref=' + cookie?.value)).toBeUndefined()
  expect(mocks.after).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).not.toHaveBeenCalled()
  await mocks.after.mock.calls[0][0]()
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('affiliate_count_click', { p_slug: 'qa-anna' })
})

it('lets a new link replace a cookie past the 15-day window or a malformed one, but not a current one', async () => {
  const time = Math.floor(Date.now() / 1000)
  // Set under the old 60-day lifetime: the browser still sends it, but it binds nothing now.
  for (const stale of ['anna.' + (time - 1296000), 'anna.' + (time - 40 * 86400), 'bad']) {
    expect((await visit('?ref=qa-ben', 'sv_ref=' + stale))?.value).toMatch(/^qa-ben\.\d+$/)
  }
  expect(await visit('?ref=qa-ben', 'sv_ref=anna.' + (time - 1295000))).toBeUndefined()
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
  for (const cookie of [undefined, 'bad', 'ABC.' + time, 'anna.' + (time - 1296000), 'anna.' + (time + 60)]) {
    await bindReferral('buyer', cookie, 'signup')
  }
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.rpc.mockRejectedValue(new Error())
  await bindReferral('buyer', 'anna.' + time, 'first_checkout')
  expect(mocks.rpc).toHaveBeenCalledWith('affiliate_bind', { p_user: 'buyer', p_slug: 'anna', p_source: 'first_checkout' })
})

// 2021: the partner stored at email sign-up for a verification opened on another device.
it('stores the current cookie\'s slug, clears the row without one, and never fails the sign-up', async () => {
  const time = Math.floor(Date.now() / 1000)
  await storeSignupReferral(undefined, 'anna.' + time)
  expect(mocks.rpc).not.toHaveBeenCalled()
  for (const cookie of [undefined, 'bad', 'anna.' + (time - 1296000)]) await storeSignupReferral('u1', cookie)
  expect(mocks.rpc.mock.calls).toEqual(Array(3).fill(['affiliate_signup_ref_store', { p_user: 'u1', p_slug: null }]))
  mocks.rpc.mockClear()
  await storeSignupReferral('u1', 'anna.' + time)
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('affiliate_signup_ref_store', { p_user: 'u1', p_slug: 'anna' })
  mocks.rpc.mockRejectedValueOnce(new Error())
  await storeSignupReferral('u1', 'anna.' + time)
  mocks.rpc.mockResolvedValueOnce({ error: { code: '42501' } })
  await storeSignupReferral('u1', 'anna.' + time)
})

describe('bindSignupReferral', () => {
  const time = () => Math.floor(Date.now() / 1000)
  const binds = () => mocks.rpc.mock.calls.filter(([fn]) => fn === 'affiliate_bind')
  const stored = (value: unknown, error: unknown = null) =>
    mocks.rpc.mockImplementation(async (fn: string) => (fn === 'affiliate_signup_ref_take' ? { data: value, error } : { error: null }))

  it('binds this browser\'s current cookie over the stored partner, however old the cookie says it is', async () => {
    stored('bob')
    await bindSignupReferral('u1', true, 'anna.' + (time() - 1295000), true)
    expect(mocks.rpc).toHaveBeenCalledWith('affiliate_signup_ref_take', { p_user: 'u1' })
    expect(binds()).toEqual([['affiliate_bind', { p_user: 'u1', p_slug: 'anna', p_source: 'signup' }]])
  })

  it('falls back to the stored partner when the cookie is missing, malformed or expired', async () => {
    stored('bob')
    for (const cookie of [undefined, 'bad', 'anna.' + (time() - 1296000)]) await bindSignupReferral('u1', true, cookie, true)
    expect(binds()).toEqual(Array(3).fill(['affiliate_bind', { p_user: 'u1', p_slug: 'bob', p_source: 'signup' }]))
  })

  // Review on #961: a squatter's row must not bind a first verification that is not the signup
  // confirmation click (a password reset on the unconfirmed account, Google).
  it('ignores the stored partner when the sign-in may not use it, and still binds the cookie', async () => {
    stored('squatter')
    await bindSignupReferral('u1', true, undefined, false)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('affiliate_signup_ref_take', { p_user: 'u1' })
    await bindSignupReferral('u1', true, 'anna.' + time(), false)
    expect(binds()).toEqual([['affiliate_bind', { p_user: 'u1', p_slug: 'anna', p_source: 'signup' }]])
  })

  it('takes the stored partner without binding when the sign-up must not bind (staff)', async () => {
    stored('bob')
    await bindSignupReferral('u1', false, 'anna.' + time(), true)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('affiliate_signup_ref_take', { p_user: 'u1' })
  })

  it('binds nothing from an empty, malformed or failed take, and still binds the cookie', async () => {
    for (const [value, error] of [[null, null], ['BAD SLUG', null], [null, { code: 'XX000' }]]) {
      stored(value, error)
      await bindSignupReferral('u1', true, undefined, true)
    }
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'affiliate_signup_ref_take') throw new Error('down')
      return { error: null }
    })
    await bindSignupReferral('u1', true, undefined, true)
    expect(binds()).toEqual([])
    await bindSignupReferral('u1', true, 'anna.' + time(), true)
    expect(binds()).toEqual([['affiliate_bind', { p_user: 'u1', p_slug: 'anna', p_source: 'signup' }]])
  })
})
