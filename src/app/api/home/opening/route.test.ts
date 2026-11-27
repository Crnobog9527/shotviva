import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cachedFeaturedBundles } from '@/core/templates/cached-bundles'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'

import { GET } from './route'

vi.mock('@/core/templates/cached-catalogue', () => ({ cachedWebCatalogue: vi.fn() }))
vi.mock('@/core/templates/cached-bundles', () => ({ cachedFeaturedBundles: vi.fn() }))
vi.mock('@/modules/image', () => ({
  HOME_CATALOGUE_CACHE_CONTROL: 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
  // The summary shape is the module's; here only which ids come back, in order.
  openingCandidates: vi.fn((live: { id: string }[], ids: string[]) => ids.filter((id) => live.some((template) => template.id === id)).map((id) => ({ id }))),
}))
vi.mock('@/core/logger', () => ({ logger: { error: vi.fn() } }))

const request = (query: string) => new Request(`https://shotviva.test/api/home/opening${query}`)
const live = (id: string, covers = true) => ({ id, coverBeforeUrl: covers ? `/b/${id}` : null, coverAfterUrl: covers ? `/a/${id}` : null, fields: { images: { slots: null } } })

beforeEach(() => vi.clearAllMocks())

describe('/api/home/opening', () => {
  it('rejects a missing or unknown locale before reading anything', async () => {
    for (const query of ['', '?locale=fr']) expect((await GET(request(query))).status).toBe(400)
    expect(cachedWebCatalogue).not.toHaveBeenCalled()
  })

  it('answers the live bundle members with both covers, shared briefly by the CDN, no cookie', async () => {
    vi.mocked(cachedWebCatalogue).mockResolvedValue([live('cake'), live('steak'), live('bare', false)] as never)
    vi.mocked(cachedFeaturedBundles).mockResolvedValue([{ id: 'b', name: 'B', memberIds: ['steak', 'bare', 'gone', 'cake'] }])
    const response = await GET(request('?locale=zh'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ templates: [{ id: 'steak' }, { id: 'cake' }] })
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=60')
    expect(response.headers.get('Vercel-Cache-Tag')).toBe('templates,providers,features')
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('answers 503, never cached, when a read fails', async () => {
    vi.mocked(cachedWebCatalogue).mockRejectedValue(new Error('down'))
    vi.mocked(cachedFeaturedBundles).mockResolvedValue([])
    const response = await GET(request('?locale=en'))
    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
