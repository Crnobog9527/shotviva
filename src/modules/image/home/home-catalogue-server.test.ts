import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/core/templates/cached-catalogue', () => ({ CATALOGUE_LIFE: {}, cachedWebTemplates: vi.fn() }))
vi.mock('@/core/templates/cached-taxonomy', () => ({ cachedCatalogueIndex: vi.fn() }))

const { cachedWebTemplates } = await import('@/core/templates/cached-catalogue')
const { cachedCatalogueIndex } = await import('@/core/templates/cached-taxonomy')
const { cachedHomeCatalogue, loadHomeCatalogue } = await import('./home-catalogue.server')

const index = { entries: [], series: [], categories: [] } as never

describe('home picker catalogue', () => {
  it('refuses to make its long-lived entry without the category index', async () => {
    vi.mocked(cachedWebTemplates).mockResolvedValue([])
    vi.mocked(cachedCatalogueIndex).mockResolvedValue(null)
    await expect(cachedHomeCatalogue('en')).rejects.toThrow()
  })

  it('serves the flat list for this request while the index is down', async () => {
    const reads = { cached: vi.fn().mockRejectedValue(new Error('An error occurred in the Server Components render')), templates: vi.fn().mockResolvedValue([]), index: vi.fn().mockResolvedValue(null) }
    await expect(loadHomeCatalogue('en', reads)).resolves.toEqual({ templates: [], browse: null })
  })

  it('returns the cached entry when there is one, and still fails when templates cannot be read', async () => {
    const cached = { templates: [], browse: { filters: [], entries: [] } }
    const reads = { cached: vi.fn().mockResolvedValue(cached), templates: vi.fn(), index: vi.fn() }
    await expect(loadHomeCatalogue('en', reads)).resolves.toBe(cached)
    expect(reads.templates).not.toHaveBeenCalled()
    const down = { cached: vi.fn().mockRejectedValue(new Error('x')), templates: vi.fn().mockRejectedValue(new Error('db down')), index: vi.fn().mockResolvedValue(index) }
    await expect(loadHomeCatalogue('en', down)).rejects.toThrow('db down')
  })
})
