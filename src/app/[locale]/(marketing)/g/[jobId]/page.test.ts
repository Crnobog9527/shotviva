import { beforeEach, describe, expect, it, vi } from 'vitest'

// 创作库规格 U1–U5 and §4 (T108): the work page is 404 unless the gallery shows the work, and
// always noindex with a canonical to itself.

const mocks = vi.hoisted(() => ({ open: true, row: null as unknown, indexingOpen: true }))
const work = { id: '0b6f2f8e-6a3f-4c1e-9d55-1f2a3b4c5d6e', templateId: 'salmon', templateName: 'Grilled dish', category: 'food', copy: [], watermarked: true }

vi.mock('@/core/gallery', () => ({
  isGalleryEnabled: async () => mocks.open,
  cachedGalleryWork: async () => mocks.row,
  galleryWorkView: (row: unknown) => (row ? work : null),
}))
vi.mock('@/core/gallery/ui', () => ({ WorkPage: () => null }))
vi.mock('@/core/i18n/server', () => ({ currentLocale: async () => 'en' }))
vi.mock('@/core/templates/cached-catalogue', () => ({ cachedWebCatalogue: async () => [] }))
vi.mock('@/core/seo/indexing-now', () => ({ indexingOpenNow: () => mocks.indexingOpen }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('./report-text', () => ({ reportText: async () => ({}) }))

const { default: Page, generateMetadata } = await import('./page')

const props = { params: Promise.resolve({ jobId: work.id }), searchParams: Promise.resolve({}) } as never
const is404 = { digest: expect.stringMatching(/404/) }

describe('/g/[jobId]', () => {
  beforeEach(() => {
    mocks.open = true
    mocks.row = { id: work.id }
    mocks.indexingOpen = true
  })

  it('is a 404 while the gallery is closed, and for a work it does not show', async () => {
    mocks.open = false
    await expect(Page(props)).rejects.toMatchObject(is404)
    mocks.open = true
    mocks.row = null
    await expect(Page(props)).rejects.toMatchObject(is404)
    await expect(generateMetadata(props)).rejects.toMatchObject(is404)
  })

  it('is noindex, follow once the site is indexable, with a canonical to itself and the work as the share image', async () => {
    const meta = await generateMetadata(props)
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(String(meta.alternates?.canonical)).toBe(`https://shotviva.com/g/${work.id}`)
    expect(JSON.stringify(meta.openGraph)).toContain(`/api/gallery/${work.id}/image?w=960`)
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' })
  })
})
