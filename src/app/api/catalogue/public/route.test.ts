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

  it('serves latest and current for a minute, and never caches an unavailable file', async () => {
    expect((await call('en', 'current')).headers.get('cache-control')).toContain('max-age=60')
    expect(await (await call('en', 'current')).json()).toEqual({ version: FILE.version })
    expect((await call('en', 'latest')).headers.get('cache-control')).toContain('max-age=60')
    cachedPublicCatalogue.mockResolvedValue(null)
    const down = await call('en', 'latest')
    expect(down.status).toBe(503)
    expect(down.headers.get('cache-control')).toBe('no-store')
  })
})
