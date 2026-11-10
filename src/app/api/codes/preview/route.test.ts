import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { seededRewards } from '../../../../../tests/t94-config'

import { GET, HEAD } from './route'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), admin: vi.fn(() => ({})) }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: mocks.admin }))
vi.mock('@/core/codes/server', () => ({ previewCode: mocks.preview }))

const get = (query: string, ip = '192.0.2.14') => GET(new NextRequest('https://qa.test/api/codes/preview?' + query, {
  headers: { 'x-forwarded-for': ip },
}))
beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.useRealTimers() })

it('returns a public normalized preview with no cache and no account session', async () => {
  const offer = { kind: 'invite', credits: seededRewards.inviteeCredits, pool: 'free', percent: null }
  mocks.preview.mockResolvedValue(offer)
  const response = await get('code=aBc4')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ preview: offer })
  expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'ABC4')
  expect(response.headers.get('cache-control')).toContain('no-store')
})

it.each(['', 'code=ab-c', 'code=TEST&code=NEXT'])('rejects invalid or ambiguous inputs before lookup: %s', async (query) => {
  expect((await get(query)).status).toBe(422)
  expect(mocks.preview).not.toHaveBeenCalled()
})

it('limits one network at 30 previews per minute before any read; another IP and a new minute get independent budgets', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-03T04:00:00Z'))
  mocks.preview.mockResolvedValue(null)
  for (let i = 0; i < 30; i++) expect((await get('code=TEST')).status).toBe(200)
  expect((await get('code=TEST')).status).toBe(429)
  expect(mocks.preview).toHaveBeenCalledTimes(30)
  expect((await get('code=TEST', '192.0.2.15')).status).toBe(200)
  vi.setSystemTime(new Date('2026-01-03T04:01:00Z'))
  expect((await get('code=TEST')).status).toBe(200)
})

it('does not run a preview query for HEAD', () => {
  expect(HEAD().status).toBe(405)
  expect(mocks.preview).not.toHaveBeenCalled()
})
