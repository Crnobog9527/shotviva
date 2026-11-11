import { describe, expect, it } from 'vitest'

import { cdnAssetUrl, cdnUrl } from './cdn-origin'

const CDN = 'https://cdn.shotviva.com'
const SITE_ASSETS = 'https://shotviva.com/assets'

describe('cdnUrl', () => {
  it('leaves every URL as it is when the asset host is off', () => {
    expect(cdnUrl('/fonts/misans/a.css', undefined)).toBe('/fonts/misans/a.css')
  })

  it('moves a root-relative public file to the asset host', () => {
    expect(cdnUrl('/cases/pet-3d.webp', CDN)).toBe('https://cdn.shotviva.com/cases/pet-3d.webp')
  })

  it.each(['https://shotviva.com/x.webp', '//evil.example/x.webp', 'data:image/png;base64,AA', 'blob:https://shotviva.com/1', 'cases/x.webp'])(
    'passes %s through',
    (url) => {
      expect(cdnUrl(url, CDN)).toBe(url)
    },
  )
})

describe('cdnAssetUrl', () => {
  it('serves a cover file under the site’s own /assets from the asset host', () => {
    expect(cdnAssetUrl(`${SITE_ASSETS}/covers/t1/loop-abc.mp4`, CDN, SITE_ASSETS)).toBe('https://cdn.shotviva.com/assets/covers/t1/loop-abc.mp4')
  })

  it('leaves it alone when the asset host is off', () => {
    expect(cdnAssetUrl(`${SITE_ASSETS}/covers/t1/loop-abc.mp4`, undefined, SITE_ASSETS)).toBe(`${SITE_ASSETS}/covers/t1/loop-abc.mp4`)
  })

  it('leaves a bucket URL alone: the CDN only proxies the site (preview covers on r2.dev)', () => {
    const r2 = 'https://pub-123.r2.dev'
    expect(cdnAssetUrl(`${r2}/covers/t1/loop.mp4`, CDN, r2)).toBe(`${r2}/covers/t1/loop.mp4`)
  })

  it('leaves anything off the assets base alone (a user photo, a blob preview)', () => {
    expect(cdnAssetUrl('/api/files/1', CDN, SITE_ASSETS)).toBe('/api/files/1')
    expect(cdnAssetUrl('https://shotviva.com/assetsX/a.mp4', CDN, SITE_ASSETS)).toBe('https://shotviva.com/assetsX/a.mp4')
  })
})
