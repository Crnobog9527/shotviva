import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountStorage } from './account-deletion'

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  deleteUser: vi.fn(),
  signOut: vi.fn(),
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

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSessionUser.mockResolvedValue({ id: 'u1', email: null, role: 'user', emailVerified: true })
    mocks.deleteUser.mockResolvedValue({ error: null })
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it('deletes R2 prefixes and the auth user, then signs out', async () => {
    const storage = fakeStorage()
    const response = await handleDeleteAccount(request({ confirm: 'DELETE' }), storage)
    expect(response.status).toBe(200)
    expect(storage.deletePrefix.mock.calls.map(([prefix]) => prefix)).toEqual(['inputs/u1/', 'outputs/u1/', 'requests/u1/'])
    expect(mocks.deleteUser).toHaveBeenCalledWith('u1')
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('rejects a cross-origin or origin-less request', async () => {
    for (const origin of ['https://evil.example', null]) {
      const response = await handleDeleteAccount(request({ confirm: 'DELETE' }, origin), fakeStorage())
      expect(response.status).toBe(403)
    }
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    mocks.getSessionUser.mockResolvedValue(null)
    const response = await handleDeleteAccount(request({ confirm: 'DELETE' }), fakeStorage())
    expect(response.status).toBe(401)
  })

  it('requires the typed confirmation', async () => {
    const response = await handleDeleteAccount(request({ confirm: 'delete' }), fakeStorage())
    expect(response.status).toBe(422)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('returns 500 without detail when deletion fails', async () => {
    mocks.deleteUser.mockResolvedValue({ error: { message: 'internal detail' } })
    const response = await handleDeleteAccount(request({ confirm: 'DELETE' }), fakeStorage())
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('internal detail')
  })
})
