import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.fn()
const setTemplatesActive = vi.fn()
const cache = vi.hoisted(() => ({ updateTag: vi.fn(), revalidatePath: vi.fn(), refresh: vi.fn() }))

vi.mock('next/cache', () => cache)
vi.mock('@/core/auth', () => ({ requireAdmin: () => requireAdmin(), createAdminSupabase: () => ({}) }))
vi.mock('@/core/admin', () => ({
  setTemplatesActive: (...args: unknown[]) => setTemplatesActive(...args),
  runAdminQuery: async (work: () => Promise<unknown>) => ({ ok: true, value: await work() }),
}))
vi.mock('@/core/public-env', () => ({ publicEnv: {} }))
vi.mock('@/core/storage', () => ({ r2Store: vi.fn(), r2PublicStore: vi.fn() }))
vi.mock('@/core/templates', () => ({ TEMPLATES_CACHE_TAG: 'templates' }))
vi.mock('@/modules/image', () => ({ CREDITS_FLOOR: {} }))

const { setTemplatesActiveAction } = await import('./actions')

const outcome = (changed: number) => ({
  active: true,
  changed: Array.from({ length: changed }, (_, i) => ({ id: `t${i}`, name: `T${i}` })),
  unchanged: [],
  skipped: [],
})

describe('setTemplatesActiveAction (T60 bulk)', () => {
  beforeEach(() => {
    requireAdmin.mockReset()
    setTemplatesActive.mockReset()
    Object.values(cache).forEach((fn) => fn.mockReset())
  })

  it('rejects non-admins before touching any template', async () => {
    requireAdmin.mockImplementation(() => notFound())
    await expect(setTemplatesActiveAction({ ids: ['a'], active: true })).rejects.toMatchObject({
      digest: expect.stringMatching(/404/),
    })
    expect(setTemplatesActive).not.toHaveBeenCalled()
  })

  it('expires the catalogue the way the single switch does, only when something changed', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: null })
    setTemplatesActive.mockResolvedValue(outcome(2))
    const result = await setTemplatesActiveAction({ ids: ['t0', 't1'], active: true })
    expect(result).toMatchObject({ ok: true, value: { changed: [{ id: 't0' }, { id: 't1' }] } })
    expect(setTemplatesActive).toHaveBeenCalledWith({}, 'admin', { ids: ['t0', 't1'], active: true }, {})
    expect(cache.updateTag).toHaveBeenCalledWith('templates')
    expect(cache.revalidatePath).toHaveBeenCalledWith('/')

    cache.updateTag.mockReset()
    setTemplatesActive.mockResolvedValue(outcome(0))
    await setTemplatesActiveAction({ ids: ['t0'], active: true })
    expect(cache.updateTag).not.toHaveBeenCalled()
  })
})
