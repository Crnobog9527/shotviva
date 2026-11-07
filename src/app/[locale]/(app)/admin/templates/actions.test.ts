import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.fn()
const setTemplatesActive = vi.fn()
const setTemplateOrder = vi.fn()
const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), refresh: vi.fn() }))

vi.mock('next/cache', () => cache)
vi.mock('@/core/auth', () => ({ requireAdmin: () => requireAdmin(), createAdminSupabase: () => ({}) }))
vi.mock('@/core/admin', () => ({
  setTemplatesActive: (...args: unknown[]) => setTemplatesActive(...args),
  setTemplateOrder: (...args: unknown[]) => setTemplateOrder(...args),
  runAdminAction: async (work: () => Promise<void>) => {
    await work()
    return { ok: true }
  },
  runAdminQuery: async (work: () => Promise<unknown>) => ({ ok: true, value: await work() }),
}))
vi.mock('@/core/public-env', () => ({ publicEnv: {} }))
vi.mock('@/core/storage', () => ({ r2Store: vi.fn(), r2PublicStore: vi.fn() }))
vi.mock('@/core/templates', () => ({ TEMPLATES_CACHE_TAG: 'templates' }))
vi.mock('@/modules/image', () => ({ CREDITS_FLOOR: {} }))

const { setTemplateOrderAction, setTemplatesActiveAction } = await import('./actions')

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
    // Stale-while-revalidate, never a blocking expiry (performance B1).
    expect(cache.revalidateTag).toHaveBeenCalledWith('templates', 'max')

    cache.revalidateTag.mockReset()
    setTemplatesActive.mockResolvedValue(outcome(0))
    await setTemplatesActiveAction({ ids: ['t0'], active: true })
    expect(cache.revalidateTag).not.toHaveBeenCalled()
  })
})

describe('setTemplateOrderAction (T76 drag-to-reorder)', () => {
  beforeEach(() => {
    requireAdmin.mockReset()
    setTemplateOrder.mockReset()
    Object.values(cache).forEach((fn) => fn.mockReset())
  })

  it('rejects non-admins before touching the order', async () => {
    requireAdmin.mockImplementation(() => notFound())
    await expect(setTemplateOrderAction({ group: 'featured', ids: ['a'] })).rejects.toMatchObject({
      digest: expect.stringMatching(/404/),
    })
    expect(setTemplateOrder).not.toHaveBeenCalled()
  })

  it('saves the group as the admin and expires the cached catalogue', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: null })
    const input = { group: 'catalogue', ids: ['b', 'a'] }
    expect(await setTemplateOrderAction(input)).toEqual({ ok: true })
    expect(setTemplateOrder).toHaveBeenCalledWith({}, 'admin', input)
    expect(cache.revalidateTag).toHaveBeenCalledWith('templates', 'max')
    expect(cache.refresh).toHaveBeenCalled()
  })
})
