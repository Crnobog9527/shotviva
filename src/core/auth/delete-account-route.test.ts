import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '../errors'
import type { AccountStorage } from './account-deletion'

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  deleteUser: vi.fn(),
  signOut: vi.fn(),
  cancelSubscriptions: vi.fn(),
}))

vi.mock('./session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('./supabase-admin', () => ({
  createAdminSupabase: () => ({ auth: { admin: { deleteUser: mocks.deleteUser } } }),
}))
vi.mock('./supabase-server', () => ({
  createServerSupabase: async () => ({ auth: { signOut: mocks.signOut } }),
}))

const { handleDeleteAccount } = await import('./delete-account-route')

const ORIGIN = 'http://localhost:3000'

function request(body: unknown, origin: string | null = ORIGIN) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (origin) headers.set('origin', origin)
  return new NextRequest(`${ORIGIN}/api/account/delete`, { method: 'POST', headers, body: JSON.stringify(body) })
}

function fakeStorage() {
  return { deletePrefix: vi.fn<AccountStorage['deletePrefix']>().mockResolvedValue() }
}

const handle = (body: unknown, storage = fakeStorage(), origin?: string | null) =>
  handleDeleteAccount(origin === undefined ? request(body) : request(body, origin), { storage, cancelSubscriptions: mocks.cancelSubscriptions })

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSessionUser.mockResolvedValue({ id: 'u1', email: null, role: 'user', verified: true, banned: false })
    mocks.deleteUser.mockResolvedValue({ error: null })
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.cancelSubscriptions.mockResolvedValue(0)
  })

  it('cancels subscriptions, deletes R2 prefixes and the auth user, then signs out', async () => {
    const storage = fakeStorage()
    const response = await handle({ confirm: 'DELETE' }, storage)
    expect(response.status).toBe(200)
    expect(mocks.cancelSubscriptions).toHaveBeenCalledWith('u1')
    expect(storage.deletePrefix.mock.calls.map(([prefix]) => prefix)).toEqual(['inputs/u1/', 'outputs/u1/', 'requests/u1/', 'tickets/u1/'])
    expect(mocks.deleteUser).toHaveBeenCalledWith('u1')
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('rejects a cross-origin or origin-less request', async () => {
    for (const origin of ['https://evil.example', null]) {
      const response = await handle({ confirm: 'DELETE' }, fakeStorage(), origin)
      expect(response.status).toBe(403)
    }
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.cancelSubscriptions).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    mocks.getSessionUser.mockResolvedValue(null)
    const response = await handle({ confirm: 'DELETE' })
    expect(response.status).toBe(401)
  })

  it('requires the typed confirmation', async () => {
    const response = await handle({ confirm: 'delete' })
    expect(response.status).toBe(422)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.cancelSubscriptions).not.toHaveBeenCalled()
  })

  it('returns 500 without detail when deletion fails', async () => {
    mocks.deleteUser.mockResolvedValue({ error: { message: 'internal detail' } })
    const response = await handle({ confirm: 'DELETE' })
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('internal detail')
  })

  it('answers 502 SUBSCRIPTION_CANCEL_FAILED and deletes nothing when Stripe will not cancel', async () => {
    mocks.cancelSubscriptions.mockRejectedValue(new AppError('SUBSCRIPTION_CANCEL_FAILED', 'Could not cancel a subscription'))
    const storage = fakeStorage()
    const response = await handle({ confirm: 'DELETE' }, storage)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ code: 'SUBSCRIPTION_CANCEL_FAILED' })
    expect(storage.deletePrefix).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
