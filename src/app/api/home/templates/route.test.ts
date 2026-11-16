import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadHomeCatalogue } from '@/modules/image'

import { GET } from './route'

vi.mock('@/modules/image', () => ({ loadHomeCatalogue: vi.fn() }))
vi.mock('@/core/logger', () => ({ logger: { error: vi.fn() } }))

const request = (query: string) => new Request(`https://shotviva.test/api/home/templates${query}`)

beforeEach(() => vi.resetAllMocks())

describe('public home picker catalogue', () => {
  it('rejects unsupported or missing locales before loading the catalogue', async () => {
    for (const query of ['?locale=fr', '']) {
      expect((await GET(request(query))).status).toBe(400)
    }
    expect(loadHomeCatalogue).not.toHaveBeenCalled()
  })

  it('returns the localized public catalogue without a session', async () => {
    const catalogue = { templates: [], browse: null }
    vi.mocked(loadHomeCatalogue).mockResolvedValue(catalogue)
    for (const locale of ['en', 'zh']) {
      const response = await GET(request(`?locale=${locale}`))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(catalogue)
      expect(loadHomeCatalogue).toHaveBeenLastCalledWith(locale)
    }
  })

  it('returns a retryable failure without exposing a database error', async () => {
    vi.mocked(loadHomeCatalogue).mockRejectedValue(new Error('database details'))
    const response = await GET(request('?locale=en'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ code: 'INTERNAL' })
  })
})
