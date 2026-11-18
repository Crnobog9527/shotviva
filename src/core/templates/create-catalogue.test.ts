import { beforeEach, expect, it, vi } from 'vitest'

const { readRows, readTree } = vi.hoisted(() => ({ readRows: vi.fn(), readTree: vi.fn() }))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('./taxonomy-reads', () => ({ readCategoryTree: readTree }))
vi.mock('../auth/supabase-admin', () => ({
  createAdminSupabase: () => ({
    rpc: vi.fn(() => {
      const query = { select: () => query, order: () => query, limit: () => query, returns: readRows }
      return query
    }),
  }),
}))

const { loadCreateCatalogue } = await import('./create-catalogue')

beforeEach(() => {
  readRows.mockReset()
  readTree.mockReset().mockResolvedValue([])
})

it('uses one database fill for concurrent callers across languages', async () => {
  const pending = Promise.withResolvers<{ data: []; error: null }>()
  readRows.mockReturnValue(pending.promise)

  const first = loadCreateCatalogue('zh', false)
  const second = loadCreateCatalogue('en', true)
  expect(readRows).toHaveBeenCalledTimes(1)
  expect(readTree).toHaveBeenCalledTimes(1)

  pending.resolve({ data: [], error: null })
  await expect(Promise.all([first, second])).resolves.toHaveLength(2)
  await loadCreateCatalogue('zh', false)
  expect(readRows).toHaveBeenCalledTimes(2)
})

it('releases a failed fill so the next request can load the catalogue', async () => {
  readRows.mockResolvedValueOnce({ data: null, error: { message: 'statement timeout' } })
    .mockResolvedValueOnce({ data: [], error: null })

  await expect(loadCreateCatalogue('en', false)).rejects.toThrow('statement timeout')
  await expect(loadCreateCatalogue('en', false)).resolves.toMatchObject({ templates: [] })
  expect(readRows).toHaveBeenCalledTimes(2)
})
