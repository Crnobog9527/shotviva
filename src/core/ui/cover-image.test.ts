import { describe, expect, it } from 'vitest'

import { coverImage, coverSrc, isCoverUrl } from './cover-image'

const BASE = 'https://shotviva.com/assets'
const COVER = `${BASE}/covers/korean-manhwa/after-8c988390aa621eda.webp`

describe('coverImage (covers at the size they are shown)', () => {
  it('turns a cover on the assets base into the optimiser srcset for the slot', () => {
    const image = coverImage(COVER, '(min-width: 1024px) 182px, 50vw', BASE)
    expect(image.sizes).toBe('(min-width: 1024px) 182px, 50vw')
    expect(image.srcSet).toMatch(/^\/_next\/image\?url=https%3A%2F%2Fshotviva\.com%2Fassets%2Fcovers%2F.+&w=\d+&q=75 \d+w, /)
    // Small widths are on offer, so a 182px plate never fetches the stored 880–1600 px file.
    expect(image.srcSet).toContain('&w=384&q=75 384w')
    expect(image.src).toMatch(/^\/_next\/image\?url=/)
    expect(Object.keys(image)).toEqual(['sizes', 'srcSet', 'src'])
  })

  it('passes anything that is not a cover through untouched', () => {
    for (const url of ['/api/files/job-1', 'blob:https://shotviva.com/1234', 'https://example.com/assets/covers/x.webp', `${BASE}x/covers/y.webp`]) {
      expect(coverImage(url, '100vw', BASE)).toEqual({ src: url })
    }
  })

  it('optimises nothing without an assets base', () => {
    expect(isCoverUrl(COVER, '')).toBe(false)
    expect(coverImage(COVER, '100vw', '')).toEqual({ src: COVER })
  })
})

describe('coverSrc (one URL, for a video poster)', () => {
  it('picks the smallest optimised width that covers the request', () => {
    expect(coverSrc(COVER, 1080, BASE)).toMatch(/^\/_next\/image\?url=.+&w=1080&q=75$/)
    expect(coverSrc(COVER, 700, BASE)).toMatch(/&w=750&q=75$/)
  })

  it('keeps a non-cover URL', () => {
    expect(coverSrc('/api/files/job-1', 1080, BASE)).toBe('/api/files/job-1')
  })
})
