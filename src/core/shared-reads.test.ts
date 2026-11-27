import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The hot public reads go through a 'use cache: remote' function (one copy for the region) instead
// of a plain 'use cache' entry in each function instance's memory, which every new instance filled
// again from the database (Supabase egress over the free quota, 2026-11-27). Each shared read keeps
// the tag its admin save expires, so a change still shows on the next request: updateTag reaches
// every cache handler, the remote one included.

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

// The body of `async function <name>(...)` up to its closing brace at the start of a line.
function body(source: string, name: string): string {
  const found = new RegExp(`async function ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(source)
  if (!found) throw new Error(`${name} not found`)
  return found[1] ?? ''
}

type Shared = { file: string; fn: string; tag: string; reads: RegExp }

const SHARED: Shared[] = [
  { file: 'src/core/system-settings/read.ts', fn: 'sharedSystemSettings', tag: 'SYSTEM_SETTINGS_CACHE_TAG', reads: /loadSystemSettings\(/ },
  { file: 'src/core/system-settings/food-toggles.ts', fn: 'sharedRead', tag: 'FOOD_TOGGLES_SWITCH_TAG', reads: /settle\(readLive\)/ },
  { file: 'src/core/system-settings/service-worker-switch.ts', fn: 'sharedRead', tag: 'SERVICE_WORKER_SWITCH_TAG', reads: /readLive\(key\)/ },
  { file: 'src/core/gallery/enabled.ts', fn: 'sharedGalleryOpen', tag: 'GALLERY_SWITCH_TAG', reads: /settle\(readGalleryOpen\)/ },
  { file: 'src/core/announcements/banner-read.ts', fn: 'sharedCandidates', tag: 'ANNOUNCEMENTS_CACHE_TAG', reads: /loadBannerCandidates\(/ },
  { file: 'src/core/templates/cached-catalogue.ts', fn: 'settledLocaleDisplay', tag: 'TEMPLATES_CACHE_TAG', reads: /readLocaleDisplay\(/ },
  { file: 'src/core/templates/cached-taxonomy.ts', fn: 'sharedIndex', tag: 'TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG', reads: /readCatalogueIndex\(/ },
  { file: 'src/core/templates/public-series.ts', fn: 'sharedSeries', tag: 'TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG', reads: /readPublicSeries\(/ },
  { file: 'src/site/billing/display-products.ts', fn: 'sharedDisplayCatalog', tag: 'BILLING_PRODUCTS_TAG', reads: /settle\(readWithRetry\)/ },
  { file: 'src/core/blog/read.ts', fn: 'settledPost', tag: 'BLOG_CACHE_TAG', reads: /readPublishedPost\(/ },
]

describe('shared (remote) reads', () => {
  for (const { file, fn, tag, reads } of SHARED) {
    it(`${file} ${fn}: remote, tagged ${tag}, reads the database`, () => {
      const text = body(read(file), fn)
      expect(text.trim().startsWith("'use cache: remote'")).toBe(true)
      expect(text).toContain(`cacheTag(${tag})`)
      expect(text).toMatch(reads)
      // Never throws (that fails the prerender of every page reading it); a failure is kept a minute.
      expect(text).toContain('await settle(')
      expect(text).toMatch(/FAILED_READ_LIFE\)/)
    })
  }

  it('the blog footer read keeps its own tag', () => {
    const text = body(read('src/core/blog/read.ts'), 'settledPosts')
    expect(text.trim().startsWith("'use cache: remote'")).toBe(true)
    expect(text).toContain('cacheTag(limit === 1 ? BLOG_FOOTER_TAG : BLOG_CACHE_TAG)')
  })

  it('the cached functions read through them, not the database directly', () => {
    expect(read('src/core/system-settings/read.ts')).toContain('const loadLive: Load = async () => unwrap(await sharedSystemSettings())')
    expect(read('src/core/system-settings/food-toggles.ts')).toContain('foodSwitchesOrOff(read: Read = shared)')
    expect(read('src/core/system-settings/service-worker-switch.ts')).toMatch(/serviceWorkerOrOff\(read: Read = shared\('service_worker_enabled'\)/)
    expect(read('src/core/system-settings/service-worker-switch.ts')).toContain("serviceWorkerOrOff(shared('service_worker_shell_enabled')")
    expect(body(read('src/core/gallery/enabled.ts'), 'cachedGalleryOpen')).toContain('unwrap(await sharedGalleryOpen())')
    expect(read('src/core/announcements/banner-read.ts')).toContain('const loadLive: Load = async () => unwrap(await sharedCandidates())')
    expect(read('src/core/templates/cached-catalogue.ts')).toMatch(/readCatalogue[\s\S]*?sharedLocaleDisplay\(\)/)
    expect(body(read('src/core/templates/cached-taxonomy.ts'), 'cachedLocaleDisplay')).toContain('sharedLocaleDisplay()')
    expect(read('src/core/templates/cached-taxonomy.ts')).toContain('const readIndex: IndexRead = async (locale) => unwrap(await sharedIndex(locale))')
    expect(read('src/core/templates/public-series.ts')).toContain('const read: Read = async (locale) => unwrap(await sharedSeries(locale))')
    expect(body(read('src/site/billing/display-products.ts'), 'displayProducts')).toContain('unwrap(await sharedDisplayCatalog())')
  })
})

// "Admin change visible immediately": every tag above is expired by the admin save that changes it.
describe('settle / unwrap', () => {
  it('a value passes through; a failure comes back as an error with its message', async () => {
    const { settle, unwrap } = await import('./shared-read')
    expect(unwrap(await settle(async () => 3))).toBe(3)
    const failed = await settle(async () => { throw new Error('down') })
    expect(failed).toEqual({ ok: false, message: 'down' })
    expect(() => unwrap(failed)).toThrow('down')
  })
})

describe('admin saves expire the shared reads', () => {
  const features = read('src/app/[locale]/(app)/admin/features/actions.ts')
  const cases: [string, string, string][] = [
    ['features', 'SYSTEM_SETTINGS_CACHE_TAG', features],
    ['food switches', 'FOOD_TOGGLES_SWITCH_TAG', features],
    ['service worker switches', 'SERVICE_WORKER_SWITCH_TAG', features],
    ['gallery switch', 'GALLERY_SWITCH_TAG', features],
    ['announcements', 'ANNOUNCEMENTS_CACHE_TAG', read('src/app/[locale]/(app)/admin/announcements/actions.ts')],
    ['products', 'BILLING_PRODUCTS_TAG', read('src/app/[locale]/(app)/admin/products/actions.ts')],
    ['blog', 'BLOG_CACHE_TAG', read('src/app/[locale]/(app)/admin/blog/actions.ts')],
    ['blog footer', 'BLOG_FOOTER_TAG', read('src/app/[locale]/(app)/admin/blog/actions.ts')],
  ]
  for (const [what, tag, source] of cases) {
    it(`${what}: updateTag(${tag})`, () => expect(source).toContain(`updateTag(${tag})`))
  }

  it('templates: the shared catalogue tag is expired through updateCatalogueTag', () => {
    expect(read('src/core/templates/catalogue-invalidation.ts')).toMatch(/updateCatalogueTag[\s\S]*?updateTag\(tag\)/)
  })

  // Checkout and the webhooks read the offers fresh, never the display copy.
  it('checkout does not use the cached display catalogue', () => {
    for (const file of ['src/app/api/checkout/route.ts', 'src/app/api/checkout/pinned.ts']) {
      let text = ''
      try { text = read(file) } catch { continue }
      expect(text).not.toContain('displayProducts')
    }
  })
})
