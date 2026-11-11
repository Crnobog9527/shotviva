import { describe, expect, it, vi } from 'vitest'

// ARCHITECTURE §9 第 1 条 (T108): /gallery is a real 404 while the admin switch is closed.

const mocks = vi.hoisted(() => ({ open: false }))
vi.mock('@/core/gallery', () => ({ isGalleryEnabled: async () => mocks.open }))
vi.mock('@/core/i18n/server', () => ({ currentLocale: async () => 'en' }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('./wall-page', () => ({ GalleryWallPage: () => null }))

const { default: Page, generateMetadata } = await import('./page')
const props = { params: Promise.resolve({}), searchParams: Promise.resolve({}) }

describe('/gallery', () => {
  it('404s while the gallery is closed', async () => {
    await expect(Page(props as never)).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    await expect(generateMetadata()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
  })

  it('renders once it is open', async () => {
    mocks.open = true
    await expect(Page(props as never)).resolves.toBeTruthy()
  })

  // The page number is read inside Suspense, never above it: read above, a page prerendered as a
  // 404 while closed failed to rebuild when the switch opened (T108 test site, 2026-11-11).
  it('does not read the page number above its Suspense boundary', async () => {
    mocks.open = true
    let read = false
    const searchParams = { then: (resolve: (v: unknown) => void) => { read = true; resolve({}) } }
    await Page({ params: Promise.resolve({}), searchParams } as never)
    expect(read).toBe(false)
  })
})
