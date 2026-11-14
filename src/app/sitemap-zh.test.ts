import { describe, expect, it, vi } from 'vitest'

// connection() needs a request scope; the route only awaits it before answering.
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<object>()), connection: vi.fn(async () => {}) }))

const { GET } = await import('./sitemap-zh.xml/route')

// ARCHITECTURE §12.0: the test process has no SITE_INDEXING, the closed default of every deployment.
describe('/sitemap-zh.xml while the pre-launch switch is closed', () => {
  it('answers 404 with noindex, never a list of /zh pages', async () => {
    const response = await GET()
    expect(response.status).toBe(404)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(await response.text()).not.toContain('/zh')
  })
})
