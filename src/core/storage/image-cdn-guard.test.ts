import { describe, expect, it } from 'vitest'

import { IMAGE_CDN_HEADER, viaImageCdn } from './image-cdn-guard'

describe('viaImageCdn', () => {
  it('spots a request the image CDN forwarded, whatever the value', () => {
    expect(viaImageCdn(new Headers({ [IMAGE_CDN_HEADER]: '1' }))).toBe(true)
    expect(viaImageCdn(new Headers({ 'X-Shotviva-Image-Cdn': '' }))).toBe(true)
    expect(viaImageCdn(new Headers({ 'x-forwarded-for': '1.2.3.4' }))).toBe(false)
  })
})
