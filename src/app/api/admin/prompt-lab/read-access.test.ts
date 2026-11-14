import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ profile: { role: 'admin', banned_at: null as string | null }, read: vi.fn(), db: vi.fn() }))
// The session check (core/auth/identity.ts): the cookie's verified JWT, then session_identity()'s row.
vi.mock('@/core/auth/identity', async (original) => {
  const real = await original<typeof import('@/core/auth/identity')>()
  return {
    ...real,
    verifyCookieIdentity: async () => ({
      status: 'signed_in',
      user: real.rowToSessionUser({ id: 'actor', email: null, phone: null, email_confirmed_at: '2026-01-01', phone_confirmed_at: null, app_metadata: {}, user_metadata: {}, ...mocks.profile }),
    }),
  }
})
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ getAll: () => [] }) }))
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: mocks.db }))
vi.mock('@/core/i18n/server', () => ({ localized: async (path: string) => path }))
vi.mock('@/core/admin/prompt-lab/store', () => ({
  versionDetail: mocks.read, reverseSettings: mocks.read, labSession: mocks.read,
  readLabRuns: mocks.read, readLabVersions: mocks.read,
}))
vi.mock('@/modules/image', () => ({ assertPromptLabVisionCapability: vi.fn(), loadPanelSummary: vi.fn(), isPromptLabVisionProvider: vi.fn() }))
vi.mock('@/core/admin/prompt-lab-ui/prompt-lab', () => ({ PromptLab: vi.fn() }))
vi.mock('@/core/admin/shell', () => ({ AdminPage: vi.fn() }))
vi.mock('@/core/i18n/navigation', () => ({ Link: vi.fn() }))
vi.mock('@/core/providers', () => ({ listProviders: vi.fn(), findProvider: vi.fn() }))
vi.mock('@/core/storage', () => ({ r2Store: vi.fn() }))

const { GET: workspace } = await import('@/app/api/admin/prompt-lab/workspace/route')
const { GET: settings } = await import('@/app/api/admin/prompt-lab/settings/route')
const { default: page } = await import('@/app/[locale]/(app)/admin/references/lab/[id]/page')
const { requireAdmin } = await import('@/core/auth/session')
const id = '05a81252-9de0-4a58-94ff-b14b044a6bb8'
const request = () => new NextRequest(`http://localhost/api/admin/prompt-lab/workspace?view=version&sessionId=${id}&id=${id}`)

beforeEach(() => { vi.clearAllMocks(); mocks.profile.banned_at = null; mocks.read.mockResolvedValue({ id }) })

it('blocks an already signed-in banned admin at both private read APIs and the page before loading data', async () => {
  mocks.profile.banned_at = '2026-11-11T00:00:00Z'
  expect((await workspace(request())).status).toBe(404)
  expect((await settings()).status).toBe(404)
  await expect(page({ params: Promise.resolve({ id }) })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  expect(mocks.read).not.toHaveBeenCalled()
  expect(mocks.db).not.toHaveBeenCalled()
})

it('allows an unbanned administrator through the same guards', async () => {
  expect((await workspace(request())).status).toBe(200)
  expect((await settings()).status).toBe(200)
  expect(await requireAdmin()).toMatchObject({ role: 'admin', banned: false })
  expect(mocks.read).toHaveBeenCalledTimes(2)
})
