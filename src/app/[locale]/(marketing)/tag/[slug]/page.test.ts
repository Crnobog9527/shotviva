import { describe, expect, it, vi } from 'vitest'

// 创作库规格 U6 (T108): no tag page exists until its keyword is whitelisted.

vi.mock('@/core/gallery', async (original) => ({ ...(await original<typeof import('@/core/gallery')>()), isGalleryEnabled: async () => true }))
vi.mock('@/core/i18n/server', () => ({ currentLocale: async () => 'en' }))

const { default: Page, generateStaticParams } = await import('./page')

describe('/tag/[slug]', () => {
  it('has no tags yet: the placeholder and any slug are 404', async () => {
    expect(generateStaticParams()).toEqual([{ slug: '__no-tags__' }])
    const props = { params: Promise.resolve({ slug: 'grilled-salmon-photo' }), searchParams: Promise.resolve({}) } as never
    await expect(Page(props)).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
  })
})
