import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { adminClient, rpc, readRows, readTree } = vi.hoisted(() => ({
  adminClient: vi.fn(), rpc: vi.fn(), readRows: vi.fn(), readTree: vi.fn(),
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('./taxonomy-reads', () => ({ readCategoryTree: readTree }))
vi.mock('../storage/r2-store', () => ({ r2ConditionalJson: () => null }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: adminClient }))

const { loadCreateCatalogue } = await import('./create-catalogue')
const { cacheLife, cacheTag } = await import('next/cache')

beforeEach(() => {
  readRows.mockReset()
  readTree.mockReset().mockResolvedValue([])
  const query = { select: () => query, order: () => query, limit: () => query, returns: readRows }
  rpc.mockReturnValue(query)
  adminClient.mockReturnValue({ rpc })
})

afterEach(() => vi.unstubAllGlobals())

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

it('keys persistent reads by a GET request and applies the existing tags to both layers', async () => {
  readRows.mockResolvedValue({ data: [], error: null })
  const fetch = vi.fn().mockResolvedValue(new Response())
  vi.stubGlobal('fetch', fetch)

  await loadCreateCatalogue('zh', true)
  expect(rpc).toHaveBeenCalledExactlyOnceWith('web_templates', { p_include_members: true }, { get: true })
  const [catalogueFetch] = adminClient.mock.calls[0]
  const url = 'https://database.example/rest/v1/rpc/web_templates'
  await catalogueFetch(url, { method: 'GET' })

  expect(cacheTag).toHaveBeenCalledExactlyOnceWith('templates', 'providers')
  expect(fetch).toHaveBeenCalledExactlyOnceWith(url, {
    method: 'GET', signal: expect.any(AbortSignal),
    next: { tags: ['templates', 'providers'], revalidate: 3600 },
  })
})

it('uses the short cache lifetime when the category tree could not be read', async () => {
  readRows.mockResolvedValue({ data: [], error: null })
  readTree.mockRejectedValueOnce(new Error('category timeout'))

  await expect(loadCreateCatalogue('zh', true)).resolves.toEqual({ index: null, templates: [] })
  expect(cacheLife).toHaveBeenCalledExactlyOnceWith({ revalidate: 60, expire: 600 })
  await expect(loadCreateCatalogue('zh', true)).resolves.toMatchObject({ index: expect.any(Object) })
  expect(readRows).toHaveBeenCalledTimes(2)
})
