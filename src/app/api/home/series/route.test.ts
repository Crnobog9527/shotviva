import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cachedFeaturedBundles } from '@/core/templates/cached-bundles'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { cachedPublicSeries } from '@/core/templates/public-series'

import { GET } from './route'

vi.mock('@/core/templates/cached-catalogue', () => ({ cachedWebCatalogue: vi.fn() }))
vi.mock('@/core/templates/public-series', () => ({ cachedPublicSeries: vi.fn() }))
vi.mock('@/core/templates/cached-bundles', () => ({ cachedFeaturedBundles: vi.fn(async () => []) }))
vi.mock('@/modules/image', () => ({ HOME_CATALOGUE_CACHE_CONTROL: 'public, max-age=0, s-maxage=60, stale-while-revalidate=60' }))
vi.mock('@/core/logger', () => ({ logger: { error: vi.fn() } }))

const request = (query: string) => new Request(`https://shotviva.test/api/home/series${query}`)
const member = (id: string) => ({ id, coverBeforeUrl: `https://shotviva.com/assets/covers/${id}/b.webp`, coverAfterUrl: `https://shotviva.com/assets/covers/${id}/a.webp` })
const series = { id: 's', slug: 's-set', name: 'S', description: null, showMembers: false, memberIds: ['a', 'b'] }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(cachedFeaturedBundles).mockResolvedValue([])
})

describe('series cards\' later pairs', () => {
  it('rejects unsupported or missing locales before reading anything', async () => {
    for (const query of ['?locale=fr', '']) expect((await GET(request(query))).status).toBe(400)
    expect(cachedWebCatalogue).not.toHaveBeenCalled()
  })

  it('answers each card key with the pairs after the first, shared briefly by the CDN and without a cookie', async () => {
    vi.mocked(cachedWebCatalogue).mockResolvedValue([member('a'), member('b')] as never)
    vi.mocked(cachedPublicSeries).mockResolvedValue([series] as never)
    for (const locale of ['en', 'zh']) {
      const response = await GET(request(`?locale=${locale}`))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ 'series-s': [['https://shotviva.com/assets/covers/b/b.webp', 'https://shotviva.com/assets/covers/b/a.webp', 'b']] })
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=60')
      expect(response.headers.get('Vercel-Cache-Tag')).toBe('templates,providers,features')
      expect(response.headers.get('Set-Cookie')).toBeNull()
      expect(cachedWebCatalogue).toHaveBeenLastCalledWith(locale)
      expect(cachedPublicSeries).toHaveBeenLastCalledWith(locale)
    }
  })

  it('answers bundle cards (精选组合) under their own key, in bundle order', async () => {
    vi.mocked(cachedWebCatalogue).mockResolvedValue([member('a'), member('b'), member('c')] as never)
    vi.mocked(cachedPublicSeries).mockResolvedValue([])
    vi.mocked(cachedFeaturedBundles).mockResolvedValue([{ id: 'k', name: 'K', memberIds: ['c', 'gone', 'a'] }])
    const body = await (await GET(request('?locale=en'))).json()
    expect(body).toEqual({ 'bundle-k': [['https://shotviva.com/assets/covers/a/b.webp', 'https://shotviva.com/assets/covers/a/a.webp', 'a']] })
    expect(cachedFeaturedBundles).toHaveBeenLastCalledWith('en')
  })

  it('never shares an empty answer (what a failed read degrades to) or a failure', async () => {
    vi.mocked(cachedWebCatalogue).mockResolvedValue([])
    vi.mocked(cachedPublicSeries).mockResolvedValue([])
    expect((await GET(request('?locale=en'))).headers.get('Cache-Control')).toBe('no-store')
    vi.mocked(cachedWebCatalogue).mockRejectedValue(new Error('down'))
    const failed = await GET(request('?locale=en'))
    expect(failed.status).toBe(503)
    expect(failed.headers.get('Cache-Control')).toBe('no-store')
  })
})
