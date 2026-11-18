import { beforeEach, expect, it, vi } from 'vitest'

const { readRows, readTree } = vi.hoisted(() => ({ readRows: vi.fn(), readTree: vi.fn() }))
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  unstable_cache: vi.fn((read: () => Promise<unknown>) => vi.fn(read)),
}))
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
const { cacheTag, unstable_cache } = await import('next/cache')
const cacheOptions = vi.mocked(unstable_cache).mock.calls[0]
const cachedRead = vi.mocked(vi.mocked(unstable_cache).mock.results[0].value)

beforeEach(() => {
  readRows.mockReset()
  readTree.mockReset().mockResolvedValue([])
  cachedRead.mockClear()
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

it('keeps the existing invalidation tags on both cache layers', async () => {
  readRows.mockResolvedValue({ data: [], error: null })

  await loadCreateCatalogue('zh', true)

  expect(cacheTag).toHaveBeenCalledExactlyOnceWith('templates', 'providers')
  expect(cacheOptions).toEqual([expect.any(Function), ['create-catalogue-v1'], {
    tags: ['templates', 'providers'], revalidate: 3600,
  }])
})

it('serves the fallback without caching an incomplete snapshot', async () => {
  readRows.mockResolvedValue({ data: [], error: null })
  readTree.mockRejectedValueOnce(new Error('category timeout'))

  await expect(loadCreateCatalogue('zh', true)).resolves.toEqual({ index: null, templates: [] })
  await expect(cachedRead.mock.results[0].value).rejects.toThrow('category tree is unavailable')
  await expect(loadCreateCatalogue('zh', true)).resolves.toMatchObject({ index: expect.any(Object) })
  expect(readRows).toHaveBeenCalledTimes(2)
})

it('refreshes instead of serving a snapshot beyond the hard age limit', async () => {
  const now = Date.now()
  readRows.mockResolvedValue({ data: [], error: null })
  cachedRead.mockResolvedValueOnce({ snapshot: null, filledAt: now - 86_400_000 })

  await expect(loadCreateCatalogue('en', false)).resolves.toMatchObject({ templates: [] })
  expect(readRows).toHaveBeenCalledTimes(1)
})
