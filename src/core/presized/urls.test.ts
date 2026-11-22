import { describe, expect, it } from 'vitest'

import { presizedSource } from './urls'

const SITE_BASE = 'https://shotviva.com/assets'
const R2_BASE = 'https://pub-p.r2.dev'
const CDN = 'https://img-eo.shotviva.com'
const KEY = 'covers/korean-manhwa/after-8c988390aa621eda.webp'

describe('presizedSource', () => {
  it('is off without the switch', () => {
    expect(presizedSource(`${SITE_BASE}/${KEY}`, { origin: undefined, assetsBase: SITE_BASE })).toBeNull()
    expect(presizedSource('/home/a.webp', { origin: '', assetsBase: SITE_BASE })).toBeNull()
  })

  it('serves a cover on the site’s /assets through the switch’s host', () => {
    const at = presizedSource(`${SITE_BASE}/${KEY}`, { origin: CDN, assetsBase: SITE_BASE })
    expect(at?.(384)).toBe(`${CDN}/assets/presized/v1/w384/${KEY}`)
  })

  it('serves a cover on a bucket base (the test site’s r2.dev) from that bucket', () => {
    const at = presizedSource(`${R2_BASE}/${KEY}`, { origin: CDN, assetsBase: R2_BASE })
    expect(at?.(640)).toBe(`${R2_BASE}/presized/v1/w640/${KEY}`)
  })

  it('serves the site’s own pictures through the switch’s host', () => {
    expect(presizedSource('/home/hero-set-phone.webp', { origin: CDN, assetsBase: SITE_BASE })?.(640)).toBe(`${CDN}/presized/v1/w640/home/hero-set-phone.webp`)
  })

  it('leaves motion files, other hosts, user photos and static imports alone', () => {
    const env = { origin: CDN, assetsBase: SITE_BASE }
    for (const src of [`${SITE_BASE}/covers/x/motion-0123456789abcdef.webp`, 'https://example.com/assets/' + KEY, '/api/files/job-1', 'blob:https://shotviva.com/1', '/brand/a.png', { src: '/x.webp' }]) {
      expect(presizedSource(src, env)).toBeNull()
    }
  })
})
