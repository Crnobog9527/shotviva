import { describe, expect, it } from 'vitest'

import { labPageHtml } from './page-html'
import { coverKey, IMAGE_CDN_ORIGIN, labOrigins, pickKeys } from './sources'

const BASE = 'https://shotviva.com/assets'

describe('coverKey', () => {
  it('takes the bucket key of a still cover under the base', () => {
    expect(coverKey(`${BASE}/templates/a/after-1f2e.webp`, BASE)).toBe('templates/a/after-1f2e.webp')
    expect(coverKey(`${BASE}/templates/a/after.jpg?x=1`, `${BASE}/`)).toBe('templates/a/after.jpg')
  })

  it('skips videos, other hosts and empty covers', () => {
    expect(coverKey(`${BASE}/templates/a/clip.mp4`, BASE)).toBeNull()
    expect(coverKey('https://example.com/assets/a.webp', BASE)).toBeNull()
    expect(coverKey(null, BASE)).toBeNull()
  })
})

describe('pickKeys', () => {
  it('keeps the first distinct covers up to the count', () => {
    const urls = [`${BASE}/a.webp`, `${BASE}/a.webp`, null, `${BASE}/b.webp`, `${BASE}/c.webp`]
    expect(pickKeys(urls, BASE, 2)).toEqual(['a.webp', 'b.webp'])
  })
})

describe('labOrigins', () => {
  it('compares the /assets rewrite and r2.dev originals, then the small files on Vercel and the CDN', () => {
    const origins = labOrigins({ assetsBase: BASE, r2Origin: 'https://pub-x.r2.dev/' })
    expect(origins.map((o) => [o.id, o.base])).toEqual([
      ['site', BASE],
      ['r2', 'https://pub-x.r2.dev'],
      ['site-s', ''],
      ['eo-s', IMAGE_CDN_ORIGIN],
      ['site-h', ''],
      ['eo-h', IMAGE_CDN_ORIGIN],
      ['site-f', ''],
      ['eo-f', IMAGE_CDN_ORIGIN],
    ])
  })

  it('has no rewrite row when the base is r2.dev itself (preview)', () => {
    const ids = labOrigins({ assetsBase: 'https://pub-p.r2.dev' }).map((o) => o.id)
    expect(ids).toEqual(['r2', 'site-s', 'eo-s', 'site-h', 'eo-h', 'site-f', 'eo-f'])
  })

  it('points the small CDN row at the switch when it is set, and has no small rows without covers', () => {
    const eo = labOrigins({ assetsBase: BASE, imageCdn: 'https://cdn.example/' }).find((o) => o.id === 'eo-s')
    expect(eo).toMatchObject({ base: 'https://cdn.example', small: true })
    expect(labOrigins({}).some((o) => o.small)).toBe(false)
    expect(labOrigins({}).map((o) => o.id)).toEqual(['site-h', 'eo-h', 'site-f', 'eo-f'])
  })
})

describe('labPageHtml', () => {
  it('embeds the config so a key cannot close the script tag', () => {
    const html = labPageHtml({ origins: [], keys: ['</script><b>.webp'] })
    expect(html).toContain('\\u003c/script>\\u003cb>.webp')
    expect(html).toContain('name="robots" content="noindex,nofollow"')
  })
})
