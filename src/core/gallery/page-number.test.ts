import { describe, expect, it } from 'vitest'

import { galleryPageOf, isBadGalleryPage } from './page-number'

// 创作库规格 U11 + 总控 review (T108): only pages 1–20 exist, and any other number is a real 404.
describe('gallery page numbers', () => {
  it('takes 1–20 written plainly; absent is page 1', () => {
    expect(galleryPageOf(undefined)).toBe(1)
    expect(galleryPageOf('1')).toBe(1)
    expect(galleryPageOf('20')).toBe(20)
    for (const bad of ['0', '01', '21', 'x', '1.5', '', ['1', '2']]) expect(galleryPageOf(bad)).toBeNull()
  })

  it('flags only /gallery addresses with a bad or repeated page number', () => {
    const bad = (path: string) => isBadGalleryPage(new URL(path, 'https://example.com'))
    expect(bad('/gallery')).toBe(false)
    expect(bad('/zh/gallery?page=20')).toBe(false)
    expect(bad('/gallery?page=21')).toBe(true)
    expect(bad('/zh/gallery?page=0')).toBe(true)
    expect(bad('/gallery?page=1&page=2')).toBe(true)
    expect(bad('/pricing?page=99')).toBe(false)
    expect(bad('/g/abc?page=99')).toBe(false)
  })
})
