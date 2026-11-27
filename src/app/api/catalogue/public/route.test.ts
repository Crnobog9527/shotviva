import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/server', () => ({ connection: async () => undefined }))
const cachedPublicCatalogue = vi.fn()
vi.mock('@/modules/image/create-data', async () => ({
  cachedPublicCatalogue,
  VERSION_PATTERN: (await import('@/modules/image/catalogue/public-catalogue')).VERSION_PATTERN,
}))
const { GET } = await import('./[locale]/[version]/route')

const call = (locale: string, version: string) => GET(new Request('https://x'), { params: Promise.resolve({ locale, version }) } as never)
const FILE = { version: '0123456789abcdef', body: '{"schema":1}', posters: true }

describe('public catalogue route', () => {
  beforeEach(() => {
    cachedPublicCatalogue.mockReset()
    cachedPublicCatalogue.mockResolvedValue(FILE)
  })

  it('answers malformed input with a 404 before any read', async () => {
    for (const [locale, version] of [['fr', 'latest'], ['zh', 'ABC'], ['zh', '0123456789abcdef0'], ['zh', '../x']]) {
      const response = await call(locale, version)
      expect(response.status).toBe(404)
    }
    expect(cachedPublicCatalogue).not.toHaveBeenCalled()
  })

  it('serves the current version immutable, and an unknown well-formed one as a short-lived 404', async () => {
    const hit = await call('zh', FILE.version)
    expect(hit.status).toBe(200)
    expect(await hit.text()).toBe(FILE.body)
    expect(hit.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    const miss = await call('zh', 'fedcba9876543210')
    expect(miss.status).toBe(404)
    expect(miss.headers.get('cache-control')).toBe('public, max-age=60')
  })

  it('lets the CDN keep latest and current a minute under the catalogue tags, browsers never, and never caches an unavailable file', async () => {
    for (const version of ['current', 'latest']) {
      const response = await call('en', version)
      expect(response.headers.get('cdn-cache-control')).toContain('max-age=60')
      expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
      expect(response.headers.get('vercel-cache-tag')).toBe('templates,providers,features')
    }
    expect(await (await call('en', 'current')).json()).toEqual({ version: FILE.version })
    cachedPublicCatalogue.mockResolvedValue(null)
    const down = await call('en', 'latest')
    expect(down.status).toBe(503)
    expect(down.headers.get('cache-control')).toBe('no-store')
  })
})

// A template rename shows on the next request: the admin save expires TEMPLATES_CACHE_TAG with
// updateTag, which on Vercel (Next 16) also deletes the CDN entries carrying that tag. A stand-in
// CDN here keeps answers by URL and tag the way Vercel's does; before the fix the answers carried
// no tag and the edge kept the old version for a minute plus its stale window (PR #963 validation).
describe('a template rename reaches the next request', () => {
  const RENAMED = { version: 'fedcba9876543210', body: '{"schema":1,"renamed":true}', posters: true }

  function edge() {
    const kept = new Map<string, { body: string; tags: string[] }>()
    return {
      async get(locale: string, version: string) {
        const key = `${locale}/${version}`
        const hit = kept.get(key)
        if (hit) return hit.body
        const response = await call(locale, version)
        const body = await response.text()
        if (/max-age=[1-9]/.test(response.headers.get('cdn-cache-control') ?? '')) {
          kept.set(key, { body, tags: (response.headers.get('vercel-cache-tag') ?? '').split(',').filter(Boolean) })
        }
        return body
      },
      updateTag(tag: string) {
        for (const [key, entry] of kept) if (entry.tags.includes(tag)) kept.delete(key)
      },
    }
  }

  beforeEach(() => {
    cachedPublicCatalogue.mockReset()
    cachedPublicCatalogue.mockResolvedValue(FILE)
  })

  it('the edge drops current and latest on the save, so the next request has the new version', async () => {
    const { TEMPLATES_CACHE_TAG } = await import('@/core/templates/cache')
    const cdn = edge()
    expect(JSON.parse(await cdn.get('zh', 'current'))).toEqual({ version: FILE.version })
    expect(await cdn.get('zh', 'latest')).toBe(FILE.body)

    // The save: the database and the Next cache now hold the new name, and the tag is expired.
    cachedPublicCatalogue.mockResolvedValue(RENAMED)
    cdn.updateTag(TEMPLATES_CACHE_TAG)

    expect(JSON.parse(await cdn.get('zh', 'current'))).toEqual({ version: RENAMED.version })
    expect(await cdn.get('zh', 'latest')).toBe(RENAMED.body)
    expect(await cdn.get('zh', RENAMED.version)).toBe(RENAMED.body)
  })

  it('the template edit save expires that tag', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/app/[locale]/(app)/admin/templates/edit/actions.ts', 'utf8')
    expect(source).toContain('await updateCatalogueTag(TEMPLATES_CACHE_TAG)')
  })

  it('the file is cached under the same tags it is sent with', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/modules/image/catalogue/public-catalogue.server.ts', 'utf8')
    expect(source).toContain('cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG, FEATURES_CACHE_TAG)')
  })
})
