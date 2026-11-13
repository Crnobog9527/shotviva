import { notFound } from 'next/navigation'
import { afterEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  requireAdmin: vi.fn(), createAdminSupabase: vi.fn(), saveAdminSeries: vi.fn(), searchSeriesCandidates: vi.fn(),
  reorderAdminSeries: vi.fn(), setAdminSeriesFlag: vi.fn(),
  revalidatePath: vi.fn(), updateTag: vi.fn(),
}))
vi.mock('@/core/auth', () => api)
vi.mock('next/cache', () => api)
vi.mock('@/core/admin/template-series', () => api)
vi.mock('@/core/admin/templates', () => ({ runAdminQuery: async (fn: () => Promise<unknown>) => ({ ok: true, value: await fn() }) }))
vi.mock('@/core/templates', () => ({ TEMPLATES_CACHE_TAG: 'templates' }))
const { reorderSeriesAction, saveSeriesAction, searchMembersAction, setSeriesFlagAction } = await import('./actions')
const input = {
  id: null, revision: null, members: [], reason: null,
  fields: { slug: 'seed', name_en: 'Seed', name_zh: '系列', description_en: null, description_zh: null,
    category_key: 'food', cover_url: null, sort_order: 1, is_active: false, show_members: false },
}
afterEach(() => { vi.resetAllMocks() })

it('guards both actions before creating any service client', async () => {
  api.requireAdmin.mockImplementation(() => notFound())
  for (const action of [() => saveSeriesAction(input), () => searchMembersAction('', null), () => reorderSeriesAction(['a']),
    () => setSeriesFlagAction({ ids: ['a'], field: 'show_members', value: true, reason: null })]) {
    await expect(action()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
  }
  expect(api.createAdminSupabase).not.toHaveBeenCalled()
})

it('uses the authenticated actor and invalidates the public catalogue and admin lists after saving', async () => {
  api.requireAdmin.mockResolvedValue({ id: 'actor' })
  api.createAdminSupabase.mockReturnValue({})
  api.saveAdminSeries.mockResolvedValue('series-id')
  expect(await saveSeriesAction(input)).toEqual({ ok: true, value: 'series-id' })
  expect(api.saveAdminSeries).toHaveBeenCalledWith({}, 'actor', input)
  expect(api.updateTag).toHaveBeenCalledWith('templates')
  expect(api.revalidatePath).toHaveBeenCalledWith('/[locale]/admin/templates', 'page')
  expect(api.revalidatePath).toHaveBeenCalledWith('/[locale]/admin/templates/series', 'page')
})

it('reorders and batch-sets as the authenticated admin and refreshes the catalogue', async () => {
  api.requireAdmin.mockResolvedValue({ id: 'actor' })
  api.createAdminSupabase.mockReturnValue({})
  api.reorderAdminSeries.mockResolvedValue(2)
  api.setAdminSeriesFlag.mockResolvedValue(1)
  expect(await reorderSeriesAction(['b', 'a'])).toEqual({ ok: true, value: 2 })
  expect(api.reorderAdminSeries).toHaveBeenCalledWith({}, 'actor', ['b', 'a'])
  const flag = { ids: ['a'], field: 'is_active' as const, value: false, reason: '季节下线' }
  expect(await setSeriesFlagAction(flag)).toEqual({ ok: true, value: 1 })
  expect(api.setAdminSeriesFlag).toHaveBeenCalledWith({}, 'actor', flag)
  expect(api.updateTag).toHaveBeenCalledTimes(2)
})
