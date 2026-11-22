import { describe, expect, it } from 'vitest'

import { coverAvif, coverImage, coverLoaderFor, coverSrc, isCoverUrl } from './cover-image'

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

describe('coverImage through the image CDN (NEXT_PUBLIC_IMAGE_CDN_URL)', () => {
  const CDN = 'https://img-eo.shotviva.com'

  it('puts the very same optimiser URLs on the CDN host', () => {
    const plain = coverImage(COVER, '50vw', BASE, '')
    const viaCdn = coverImage(COVER, '50vw', BASE, CDN)
    expect(viaCdn.sizes).toBe(plain.sizes)
    expect(viaCdn.srcSet).toBe(plain.srcSet?.replaceAll('/_next/image?', `${CDN}/_next/image?`))
    expect(viaCdn.src).toBe(`${CDN}${plain.src}`)
  })

  it('leaves non-covers alone and is off when unset', () => {
    expect(coverImage('/api/files/job-1', '100vw', BASE, CDN)).toEqual({ src: '/api/files/job-1' })
    expect(coverImage(COVER, '100vw', BASE).src).toMatch(/^\/_next\/image\?/)
    expect(coverLoaderFor('/home/hero.webp', BASE, CDN)?.({ src: '/home/hero.webp', width: 640 })).toBe(`${CDN}/_next/image?url=%2Fhome%2Fhero.webp&w=640&q=75`)
    expect(coverLoaderFor('/api/files/job-1', BASE, CDN)).toBeUndefined()
    expect(coverLoaderFor('/admin-media/references/x.webp', BASE, CDN)).toBeUndefined()
    expect(coverLoaderFor(COVER, BASE, undefined)).toBeUndefined()
    expect(coverLoaderFor(COVER, BASE, CDN)?.({ src: COVER, width: 384, quality: 75 })).toBe(`${CDN}/_next/image?url=${encodeURIComponent(COVER)}&w=384&q=75`)
    expect(coverSrc(COVER, 700, BASE, CDN)).toBe(`${CDN}/_next/image?url=${encodeURIComponent(COVER)}&w=750&q=75`)
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

describe('coverImage from the pre-sized copies (NEXT_PUBLIC_PRESIZED_IMAGES_URL)', () => {
  const CDN = 'https://img-eo.shotviva.com'
  const KEY = 'covers/korean-manhwa/after-8c988390aa621eda.webp'

  // Every candidate is a stored copy at least as wide as its descriptor (in a build the widths are
  // exactly the stored ones, next.config.ts; the test runs on Next's default list).
  function candidates(srcSet: string | undefined) {
    return (srcSet ?? '').split(', ').map((entry) => {
      const [href = '', descriptor = ''] = entry.split(' ')
      return { href, width: Number.parseInt(descriptor, 10) }
    })
  }

  it('points the srcset at fixed-width WebP files on the switch’s host, no optimiser and no query', () => {
    const image = coverImage(COVER, '(min-width: 1024px) 182px, 50vw', BASE, CDN, CDN)
    expect(image.sizes).toBe('(min-width: 1024px) 182px, 50vw')
    for (const { href, width } of candidates(image.srcSet)) {
      const match = new RegExp(`^${CDN}/assets/presized/v1/w(\\d+)/${KEY}$`).exec(href)
      expect(match, href).not.toBeNull()
      expect(Number(match?.[1])).toBeGreaterThanOrEqual(width)
    }
    expect(image.srcSet).toContain(`${CDN}/assets/presized/v1/w384/${KEY} 384w`)
    expect(image.src).toMatch(new RegExp(`^${CDN}/assets/presized/v1/w\\d+/${KEY}$`))
  })

  it('keeps today’s optimiser URLs when the switch is off, and for anything without copies', () => {
    expect(coverImage(COVER, '50vw', BASE, CDN, undefined)).toEqual(coverImage(COVER, '50vw', BASE, CDN))
    const motion = `${BASE}/covers/x/motion-0123456789abcdef.webp`
    expect(coverImage(motion, '50vw', BASE, CDN, CDN).srcSet).toContain(`${CDN}/_next/image?`)
    expect(coverImage('/api/files/job-1', '50vw', BASE, CDN, CDN)).toEqual({ src: '/api/files/job-1' })
  })

  it('gives the site’s pictures and next/image callers the same files', () => {
    expect(coverLoaderFor('/home/hero.webp', BASE, CDN, CDN)?.({ src: '/home/hero.webp', width: 640 })).toBe(`${CDN}/presized/v1/w640/home/hero.webp`)
    expect(coverLoaderFor(COVER, BASE, undefined, CDN)?.({ src: COVER, width: 828 })).toBe(`${CDN}/assets/presized/v1/w828/${KEY}`)
    expect(coverLoaderFor(COVER, BASE, undefined, CDN)?.origin).toBe(CDN)
    expect(coverLoaderFor('/brand/email/wordmark.png', BASE, CDN, CDN)?.({ src: '/brand/email/wordmark.png', width: 640 })).toBe(`${CDN}/_next/image?url=%2Fbrand%2Femail%2Fwordmark.png&w=640&q=75`)
  })
})

describe('coverAvif (the <picture> source next to coverImage)', () => {
  const CDN = 'https://img-eo.shotviva.com'
  const KEY = 'covers/korean-manhwa/after-8c988390aa621eda.webp'
  const AVIF = KEY.replace(/\.webp$/, '.avif')

  it('lists the AVIF copies at the same widths as the <img>’s WebP srcset', () => {
    const sizes = '(min-width: 1024px) 182px, 50vw'
    const avif = coverAvif(COVER, sizes, BASE, CDN)
    const webp = coverImage(COVER, sizes, BASE, undefined, CDN)
    expect(avif?.sizes).toBe(sizes)
    expect(avif?.srcSet).toContain(`${CDN}/assets/presized/v1/w384/${AVIF} 384w`)
    expect(avif?.srcSet).toBe(webp.srcSet?.replaceAll('.webp ', '.avif ').replace(/\.webp$/, '.avif'))
  })

  it('is undefined with the switch off or for anything without copies', () => {
    expect(coverAvif(COVER, '50vw', BASE, undefined)).toBeUndefined()
    expect(coverAvif(`${BASE}/covers/x/motion-0123456789abcdef.webp`, '50vw', BASE, CDN)).toBeUndefined()
    expect(coverAvif('/api/files/job-1', '50vw', BASE, CDN)).toBeUndefined()
  })
})
