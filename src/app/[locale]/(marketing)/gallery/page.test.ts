import { describe, expect, it, vi } from 'vitest'

// ARCHITECTURE §9 第 1 条 (T108): /gallery is a real 404 while the admin switch is closed.

const mocks = vi.hoisted(() => ({ open: false }))
vi.mock('@/core/gallery', () => ({ isGalleryEnabled: async () => mocks.open, GALLERY_MAX_PAGES: 20 }))
vi.mock('@/core/i18n/server', () => ({ currentLocale: async () => 'en' }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('./wall-page', () => ({ GalleryWallPage: () => null }))

const { default: Page, generateMetadata } = await import('./page')
const props = { params: Promise.resolve({}), searchParams: Promise.resolve({}) }
const withPage = (page: string) => ({ ...props, searchParams: Promise.resolve({ page }) }) as never

describe('/gallery', () => {
  it('404s while the gallery is closed', async () => {
    await expect(Page(props as never)).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    await expect(generateMetadata()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
  })

  it('renders once it is open, and 404s any page number but 1–20', async () => {
    mocks.open = true
    await expect(Page(props as never)).resolves.toBeTruthy()
    for (const page of ['2', '20']) await expect(Page(withPage(page))).resolves.toBeTruthy()
    for (const page of ['21', '0', '01', 'x', '1.5']) {
      await expect(Page(withPage(page))).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    }
  })
})
