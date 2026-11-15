import { getImageProps } from 'next/image'
import { describe, expect, it } from 'vitest'

import { capSrcSet, slotMaxPx } from './srcset-cap'

const CARD = '(min-width: 1024px) 276px, (min-width: 768px) 25vw, 29vw'
const widthsOf = (srcSet: string | undefined) => (srcSet ?? '').split(', ').map((entry) => Number(entry.split(' ').pop()?.replace('w', '')))
const cover = (sizes: string) => getImageProps({ src: 'https://shotviva.com/assets/covers/x/after.webp', alt: '', width: 900, height: 1125, sizes }).props

describe('slotMaxPx (the widest the slot is drawn)', () => {
  it('reads descending min-width entries and the bare default', () => {
    expect(slotMaxPx(CARD)).toBe(276)
    // 25vw of a 1023 px tablet is wider than nothing else here: 50vw below 768 is 384.
    expect(slotMaxPx('(min-width: 1024px) 268px, (min-width: 768px) 320px, 50vw')).toBe(384)
    expect(slotMaxPx('(min-width: 768px) 120px, 45vw')).toBeCloseTo(345.6)
    expect(slotMaxPx('48px')).toBe(48)
  })

  it('gives up on anything else, so nothing is dropped', () => {
    for (const sizes of ['100vw', '(min-width: 768px) 50vw, 100vw', '(max-width: 600px) 100vw, 50vw', '(min-width: 768px) 120px, calc(100vw - 32px)', '(min-width: 500px) 1px, (min-width: 900px) 2px, 3px', '120px, 40vw']) {
      expect(slotMaxPx(sizes)).toBeNull()
    }
  })
})

describe('capSrcSet', () => {
  it('keeps a template card to the widths a 1× or 2× screen picks', () => {
    const img = cover(CARD)
    expect(widthsOf(img.srcSet)).toEqual([256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840])
    const capped = capSrcSet(img, CARD)
    expect(widthsOf(capped.srcSet)).toEqual([256, 384, 640])
    // src is the widest kept file, as next/image makes it the widest listed.
    expect(capped.src).toBe(capped.srcSet?.split(', ').at(-1)?.split(' ')[0])
    expect(capped.src).toContain('w=640')
  })

  it('still offers what a 3× phone asked for before (phone-sizes.ts)', () => {
    // 29vw on a 430 px phone at 3×: 374 px, the 384 w file.
    expect(widthsOf(capSrcSet(cover(CARD), CARD).srcSet)).toContain(384)
  })

  it('leaves unbounded or unknown slots and density srcsets alone', () => {
    const wide = cover('100vw')
    expect(capSrcSet(wide, '100vw')).toEqual(wide)
    const fixed = getImageProps({ src: '/home/a.webp', alt: '', width: 300, height: 300 }).props
    expect(capSrcSet(fixed, '300px')).toEqual(fixed)
    expect(capSrcSet({ src: '/x.png' }, CARD)).toEqual({ src: '/x.png' })
  })
})
