import { describe, expect, it } from 'vitest'

import {
  isPresizableCoverKey,
  isPresizablePublicPicture,
  PRESIZED_DEVICE_SIZES,
  PRESIZED_IMAGE_SIZES,
  PRESIZED_WIDTHS,
  presizedPath,
  presizedPaths,
  presizedWidthFor,
} from './paths'

describe('pre-sized widths', () => {
  it('splits into next/image lists whose image sizes are all below the first device size', () => {
    expect([...PRESIZED_IMAGE_SIZES, ...PRESIZED_DEVICE_SIZES]).toEqual([...PRESIZED_WIDTHS])
    expect(Math.max(...PRESIZED_IMAGE_SIZES)).toBeLessThan(PRESIZED_DEVICE_SIZES[0])
  })

  it('keeps the widths a phone or desktop slot picked from Next’s defaults (128 px and up)', () => {
    for (const width of [128, 256, 384, 640, 750, 828, 1080, 1200]) expect(PRESIZED_WIDTHS).toContain(width)
  })

  it('maps any requested width to the smallest stored one at least that wide', () => {
    expect(presizedWidthFor(32)).toBe(128)
    expect(presizedWidthFor(384)).toBe(384)
    expect(presizedWidthFor(385)).toBe(640)
    expect(presizedWidthFor(3840)).toBe(1600)
  })
})

describe('presizedPath', () => {
  it('puts the copy under presized/v1/w{width}/ with the same path, always .webp', () => {
    expect(presizedPath('covers/manhwa/after-8c988390aa621eda.webp', 640)).toBe('presized/v1/w640/covers/manhwa/after-8c988390aa621eda.webp')
    expect(presizedPath(`covers/x/sync-${'a'.repeat(64)}.jpg`, 128)).toBe(`presized/v1/w128/covers/x/sync-${'a'.repeat(64)}.webp`)
    expect(presizedPath('home/hero-set-phone.webp', 700)).toBe('presized/v1/w750/home/hero-set-phone.webp')
  })

  it('names the AVIF copy the same way', () => {
    expect(presizedPath('covers/manhwa/after-8c988390aa621eda.webp', 640, 'avif')).toBe('presized/v1/w640/covers/manhwa/after-8c988390aa621eda.avif')
  })

  it('lists one path per stored width and format', () => {
    const paths = presizedPaths('home/a.webp')
    expect(paths).toHaveLength(PRESIZED_WIDTHS.length * 2)
    expect(paths).toContain('presized/v1/w128/home/a.avif')
    expect(paths).toContain('presized/v1/w1600/home/a.webp')
  })
})

describe('which pictures have copies', () => {
  it('takes content-hashed still covers only', () => {
    expect(isPresizableCoverKey('covers/korean-manhwa/after-8c988390aa621eda.webp')).toBe(true)
    expect(isPresizableCoverKey('covers/x/before-0123456789abcdef.webp')).toBe(true)
    expect(isPresizableCoverKey('covers/x/poster-0123456789abcdef.webp')).toBe(true)
    expect(isPresizableCoverKey(`covers/x/sync-${'b'.repeat(64)}.png`)).toBe(true)
    for (const key of [
      'covers/x/motion-0123456789abcdef.webp',
      'covers/x/motion-0123456789abcdef.mp4',
      `covers/x/sync-${'b'.repeat(64)}.gif`,
      `covers/x/sync-${'b'.repeat(64)}.mp4`,
      'covers/x/after.webp',
      'covers/X/after-0123456789abcdef.webp',
      'blog/after-0123456789abcdef.webp',
      'presized/v1/w128/covers/x/after-0123456789abcdef.webp',
      'covers/../after-0123456789abcdef.webp',
    ]) {
      expect(isPresizableCoverKey(key), key).toBe(false)
    }
  })

  it('takes the pre-sized public directories only', () => {
    expect(isPresizablePublicPicture('/home/hero-set-phone.webp')).toBe(true)
    expect(isPresizablePublicPicture('/cases/food/plate-1.png')).toBe(true)
    for (const src of ['/brand/email/wordmark.png', '/og/default.png', '/home/logo.svg', '/home/../og/x.webp', 'home/a.webp', '/api/files/1', 'https://x.com/home/a.webp']) {
      expect(isPresizablePublicPicture(src), src).toBe(false)
    }
  })
})
