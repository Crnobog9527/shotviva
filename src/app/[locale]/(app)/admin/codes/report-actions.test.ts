import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ admin: vi.fn(), db: vi.fn(), rpc: vi.fn(), refresh: vi.fn() }))
vi.mock('@/core/auth', () => ({ createAdminSupabase: mocks.db, requireAdmin: mocks.admin }))
vi.mock('next/cache', () => ({ refresh: mocks.refresh }))
vi.mock('@/core/admin/code-reports', async () => ({
  ...(await import('@/core/admin/code-reports/copy')), ...(await import('@/core/admin/code-reports/schemas')),
}))
const { default: list } = await import('./page')
const { default: detail } = await import('./[id]/page')
const { default: invites } = await import('./invites/page')
const { toggleCode } = await import('./report-actions')

const codeId = '499bbc91-860b-4fb0-9beb-998f40c7605e'
const pageProps = { params: Promise.resolve({ locale: 'en', id: codeId }), searchParams: Promise.resolve({}) }
const endpoints = [() => list(pageProps), () => detail(pageProps), () => invites(pageProps), () => toggleCode('', new FormData())]

describe('private code reports', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.db.mockReturnValue({ rpc: mocks.rpc }) })

  it('checks the session administrator before each report and toggle', async () => {
    mocks.admin.mockImplementation(notFound)
    for (const endpoint of endpoints) await expect(endpoint()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    expect(mocks.db).not.toHaveBeenCalled()
  })

  it('only uses the server actor and validates the target before the audited toggle', async () => {
    mocks.admin.mockResolvedValue({ id: 'session-admin' })
    mocks.rpc.mockResolvedValue({ error: null })
    const form = new FormData()
    form.set('id', codeId)
    form.set('active', '0')
    form.set('p_actor', 'untrusted')
    expect(await toggleCode('', form)).not.toBe('')
    expect(mocks.rpc).not.toHaveBeenCalled()
    form.set('active', 'false')
    expect(await toggleCode('', form)).toBe('')
    expect(mocks.rpc).toHaveBeenCalledWith('admin_set_code_active', { p_actor: 'session-admin', p_code_id: codeId, p_active: false })
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
