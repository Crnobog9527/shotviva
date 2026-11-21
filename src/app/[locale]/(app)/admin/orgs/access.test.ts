import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spies = vi.hoisted(() => ({ admin: vi.fn(), db: vi.fn() }))
vi.mock('@/core/auth', () => ({ createAdminSupabase: spies.db, requireAdmin: spies.admin }))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
const { default: listPage } = await import('./page')
const { default: detailPage } = await import('./[id]/page')
const { addMemberAction, createOrgAction, grantOrgAction, saveOrgAction, savePackageAction, savePaymentAccountAction, searchUsersAction } = await import('./actions')

const ID = '11111111-1111-4111-8111-111111111111'
const endpoints = [
  () => listPage({ searchParams: Promise.resolve({}), params: Promise.resolve({ locale: 'en' }) } as never),
  () => detailPage({ params: Promise.resolve({ locale: 'en', id: ID }) } as never),
  () => createOrgAction({}),
  () => saveOrgAction({}),
  () => grantOrgAction({}),
  () => savePackageAction({}),
  () => savePaymentAccountAction({}),
  () => addMemberAction({}),
  () => searchUsersAction({ query: 'ab', orgId: null }),
]

describe('enterprise admin endpoints', () => {
  beforeEach(() => vi.resetAllMocks())
  it('404 for a non-admin before touching the database, on every page and server action', async () => {
    spies.admin.mockImplementation(notFound)
    for (const endpoint of endpoints) await expect(endpoint()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    expect(spies.db).not.toHaveBeenCalled()
  })
})
