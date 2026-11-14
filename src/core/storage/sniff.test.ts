import { describe, expect, it } from 'vitest'

import { heicHeader, jpeg, png, text } from '../../../tests/fakes/images'
import { sniffImageType } from './sniff'

describe('sniffImageType', () => {
  it('recognises real images by their bytes', async () => {
    expect(sniffImageType(await jpeg(16, 16))).toBe('image/jpeg')
    expect(sniffImageType(await png(16, 16))).toBe('image/png')
    expect(sniffImageType(heicHeader())).toBe('image/heic')
  })

  it('does not trust a renamed text file', () => {
    expect(sniffImageType(text('this is not a photo, just renamed to .jpg'))).toBeNull()
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull()
  })
})
