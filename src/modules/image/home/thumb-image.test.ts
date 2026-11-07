import { describe, expect, it } from 'vitest'

import { thumbImage } from './thumb-image'

describe('thumbImage (performance B3)', () => {
  it('asks the optimiser for the thumbnail width and its 2x, never the full cover', () => {
    const { src, srcSet } = thumbImage('https://shotviva.com/assets/covers/white-background/after-4f8f.webp', 44)
    expect(src).toMatch(/^\/_next\/image\?url=https%3A%2F%2Fshotviva\.com%2Fassets%2Fcovers%2F.+&w=96&q=75$/)
    expect(srcSet).toMatch(/&w=48&q=75 1x, .+&w=96&q=75 2x$/)
  })
})
