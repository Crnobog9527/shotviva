import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { HOTEL_TEMPLATES, homeSpaces } from '@/site/content/home-spaces'
import { zhHomeSpaces } from '@/site/content/zh/home-spaces'

import { GET } from './route'

vi.mock('@/core/templates/cached-catalogue', () => ({ cachedWebCatalogue: vi.fn() }))
vi.mock('@/modules/image', () => ({ HOME_CATALOGUE_CACHE_CONTROL: 'public, max-age=0, s-maxage=60, stale-while-revalidate=60' }))
vi.mock('@/core/logger', () => ({ logger: { error: vi.fn() } }))

const request = (query: string) => new Request(`https://shotviva.test/api/home/hotels${query}`)
const covers = (id: string) => ({ id, coverBeforeUrl: `https://shotviva.com/assets/covers/${id}/b.webp`, coverAfterUrl: `https://shotviva.com/assets/covers/${id}/a.webp` })

beforeEach(() => vi.resetAllMocks())

describe('hotels viewer pictures', () => {
  it('rejects unsupported or missing locales before reading anything', async () => {
    for (const query of ['?locale=fr', '']) expect((await GET(request(query))).status).toBe(400)
    expect(cachedWebCatalogue).not.toHaveBeenCalled()
  })

  it('answers the four cases in list order with their live covers, shared briefly and without a cookie', async () => {
    vi.mocked(cachedWebCatalogue).mockResolvedValue(Object.values(HOTEL_TEMPLATES).map(covers) as never)
    for (const [locale, spaces] of [['en', homeSpaces], ['zh', zhHomeSpaces]] as const) {
      const response = await GET(request(`?locale=${locale}`))
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual(
        spaces.items.map((item) => ({
          before: { src: covers(item.template!).coverBeforeUrl, alt: item.before.alt },
          after: { src: covers(item.template!).coverAfterUrl, alt: item.after.alt },
        })),
      )
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=60')
      expect(response.headers.get('Set-Cookie')).toBeNull()
      expect(cachedWebCatalogue).toHaveBeenLastCalledWith(locale)
    }
  })

  it('answers the built-in pictures, never shared, when the catalogue read came back empty', async () => {
    vi.mocked(cachedWebCatalogue).mockResolvedValue([])
    const response = await GET(request('?locale=en'))
    expect((await response.json())[0].before.src).toBe(homeSpaces.items[0].before.src)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('answers 503, never shared, when the read throws', async () => {
    vi.mocked(cachedWebCatalogue).mockRejectedValue(new Error('down'))
    const response = await GET(request('?locale=zh'))
    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
