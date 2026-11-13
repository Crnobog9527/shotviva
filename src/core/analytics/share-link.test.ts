import { describe, expect, it } from 'vitest'

import { encodeShareMark, isShareId, newShareId, parseShareMark, referrerHostOf, sharePath } from './share-link'

describe('template share links (Owner 2026-11-13)', () => {
  it('makes 8-character ids from a-z and 0-9', () => {
    const id = newShareId(() => new Uint8Array([0, 25, 26, 35, 36, 255, 7, 100]))
    expect(id).toBe('az09adh2')
    expect(isShareId(id)).toBe(true)
    expect(isShareId(newShareId())).toBe(true)
    expect(isShareId('ABCDEFGH')).toBe(false)
  })

  it('builds the share path with or without a share id', () => {
    expect(sharePath('cn-black-spotlight', 'k3x9m2pa')).toBe('/t/cn-black-spotlight?s=k3x9m2pa')
    expect(sharePath('cn-black-spotlight')).toBe('/t/cn-black-spotlight')
  })

  it('round-trips the cookie mark and refuses anything else', () => {
    expect(parseShareMark(encodeShareMark({ templateId: 'cn-black-spotlight', shareId: 'k3x9m2pa' }))).toEqual({ templateId: 'cn-black-spotlight', shareId: 'k3x9m2pa' })
    expect(parseShareMark('cn-black-spotlight')).toEqual({ templateId: 'cn-black-spotlight', shareId: null })
    for (const bad of ['', 'A.b', 'x.toolongid1', 'x.k3x9m2pa.extra', '<script>', undefined]) expect(parseShareMark(bad)).toBeNull()
  })

  it('keeps only another site host as the referrer, without www.', () => {
    expect(referrerHostOf('https://www.google.com/search?q=x', 'shotviva.com')).toBe('google.com')
    expect(referrerHostOf('https://mp.weixin.qq.com/s/abc', 'shotviva.com')).toBe('mp.weixin.qq.com')
    expect(referrerHostOf('https://shotviva.com/generate', 'www.shotviva.com')).toBeNull()
    expect(referrerHostOf('', 'shotviva.com')).toBeNull()
    expect(referrerHostOf('android-app://com.tencent.mm', 'shotviva.com')).toBeNull()
  })
})
