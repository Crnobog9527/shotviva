import { NextRequest } from 'next/server'
import { expect, it, vi } from 'vitest'

// Staff accounts (Owner 2026-11-22): an active org member is refused before the route reads the
// catalog, looks up a retry or creates any provider session.
const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), createCheckout: vi.fn(), createWaffoCheckout: vi.fn() }))

vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-admin', () => ({
  createAdminSupabase: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))
vi.mock('@/core/billing/stripe', async (original) => ({ ...(await original<typeof import('@/core/billing/stripe')>()), createCheckout: mocks.createCheckout }))
vi.mock('@/core/billing/waffo', async (original) => ({ ...(await original<typeof import('@/core/billing/waffo')>()), createWaffoCheckout: mocks.createWaffoCheckout }))

const { POST } = await import('./route')

const ORIGIN = 'http://localhost:3000'
const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: null, role: 'user', verified: true, banned: false }

it('answers 409 ORG_MEMBER_CHECKOUT for an active org member and starts nothing', async () => {
  mocks.getSessionUser.mockResolvedValue(USER)
  const chain = { select: () => chain, eq: () => chain, limit: async () => ({ data: [{ org_id: 'o' }], error: null }) }
  mocks.from.mockReturnValue(chain)
  const response = await POST(new NextRequest(`${ORIGIN}/api/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ product_id: 'pack_s', method: 'card', pricing_version: 'v1' }),
  }))
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'ORG_MEMBER_CHECKOUT' })
  expect(mocks.from).toHaveBeenCalledWith('org_members')
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.createCheckout).not.toHaveBeenCalled()
  expect(mocks.createWaffoCheckout).not.toHaveBeenCalled()
})
