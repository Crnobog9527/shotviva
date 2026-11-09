import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

import { GET } from './route'

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), createAdminSupabase: vi.fn(), readPendingDiscount: vi.fn() }))
vi.mock('@/core/auth', () => mocks)
vi.mock('@/core/codes/server', () => mocks)
beforeEach(() => { vi.resetAllMocks() })

const get = (cookie = '') => GET(new NextRequest('https://qa.test/api/codes/pending?user=another', { headers: { cookie } }))

it.each([['sv_code=VALID42', true], ['sv_code=bad!', false], ['', false]])('exposes only a registration hint to a guest', async (cookie, guestCode) => {
  const response = await get(String(cookie))
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ buyer: false, guestCode, pending: null })
  expect(mocks.createAdminSupabase).not.toHaveBeenCalled()
})

it.each([{ verified: false }, { verified: true, banned: true }])('omits pending offers for an ineligible session', async user => {
  mocks.getSessionUser.mockResolvedValue(user)
  expect(await (await get('sv_code=VALID42')).json()).toEqual({ buyer: false, guestCode: false, pending: null })
  expect(mocks.readPendingDiscount).not.toHaveBeenCalled()
})

it('looks up only the authenticated buyer, even with an unrelated cookie and user parameter', async () => {
  mocks.getSessionUser.mockResolvedValue({ id: 'authenticated-id', verified: true, banned: false })
  mocks.createAdminSupabase.mockReturnValue('admin-client')
  mocks.readPendingDiscount.mockResolvedValue({ code: 'SAVED42' })
  expect(await (await get('sv_code=OTHER22')).json()).toEqual({ buyer: true, guestCode: false, pending: { code: 'SAVED42' } })
  expect(mocks.readPendingDiscount).toHaveBeenCalledExactlyOnceWith('admin-client', 'authenticated-id')
})
