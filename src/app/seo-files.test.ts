import { connection } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as llms } from './llms.txt/route'
import { GET as sitemapPages } from './sitemap-pages.xml/route'
import { GET as sitemapIndex } from './sitemap.xml/route'

vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<object>()), connection: vi.fn(async () => {}) }))

// ARCHITECTURE §12.0, closed by default (no SITE_INDEXING in tests). Each route must answer a
// real 404 at request time: on 2026-11-06 production served the prerendered /sitemap.xml 404 as
// a static file with status 200.
describe('sitemap and llms.txt routes while indexing is closed', () => {
  beforeEach(() => vi.mocked(connection).mockClear())

  it.each([
    ['/sitemap.xml', sitemapIndex],
    ['/sitemap-pages.xml', sitemapPages],
    ['/llms.txt', llms],
  ])('%s is a noindex 404 that opts out of prerendering', async (_path, GET) => {
    const response = await GET()
    expect(response.status).toBe(404)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(connection).toHaveBeenCalledOnce()
  })
})
