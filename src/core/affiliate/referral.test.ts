import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), after: vi.fn(), rpc: vi.fn() }))
vi.mock('next/server', async (load) => ({ ...(await load<typeof import('next/server')>()), after: mocks.after }))
vi.mock('./feature', () => ({ isAffiliateEnabled: mocks.enabled }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
import { bindReferral, recordReferral } from './referral'

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
