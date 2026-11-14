import { describe, expect, it } from 'vitest'

import { touchOf } from './first-touch'
import { openTouch, sealTouch } from './seal'

const at = (href: string, referrer: string | null = null) => touchOf({ url: new URL(href), referrer, ownHost: 'shotviva.com', now: 1_800_000_000_000 })

describe('touchOf', () => {
  it('keeps the landing path with its language, the referring host and the campaign parameters', () => {
    expect(at('https://shotviva.com/zh/t/ramen-studio?s=k3x9m2pa&utm_source=test&utm_medium=social', 'https://www.google.com/search?q=secret')).toEqual({
      v: 1,
      p: '/zh/t/ramen-studio?s=k3x9m2pa&utm_source=test&utm_medium=social',
      r: 'google.com',
      us: 'test',
      um: 'social',
      st: 'ramen-studio',
      si: 'k3x9m2pa',
      at: 1_800_000_000,
    })
  })

  it('removes sensitive parameters and our own site as referrer', () => {
    const touch = at('https://shotviva.com/login?code=abc&email=a@b.co&next=/pricing', 'https://shotviva.com/')
    expect(touch.p).toBe('/login?next=%2Fpricing')
    expect(touch.r).toBeUndefined()
  })

  it('marks the Graylum connect page and promoter links, and caps lengths', () => {
    expect(at('https://shotviva.com/connect/graylum').g).toBe(1)
    expect(at('https://shotviva.com/?ref=lisa-k').a).toBe('lisa-k')
    expect(at('https://shotviva.com/?ref=<x>').a).toBeUndefined()
    const long = at(`https://shotviva.com/?utm_campaign=${'x'.repeat(500)}&q=${'y'.repeat(500)}`)
    expect(long.uc).toHaveLength(100)
    expect(long.p.length).toBeLessThanOrEqual(300)
  })
})

describe('sealTouch / openTouch', () => {
  const touch = at('https://shotviva.com/?utm_source=test')
  it('opens what it sealed, and nothing forged, altered or under another key', () => {
    const sealed = sealTouch(touch, 'secret-a')
    expect(openTouch(sealed, 'secret-a')).toEqual(touch)
    expect(openTouch(sealed, 'secret-b')).toBeNull()
    const [body, tag] = sealed.split('.') as [string, string]
    const forged = Buffer.from(JSON.stringify({ ...touch, us: 'evil' })).toString('base64url')
    expect(openTouch(`${forged}.${tag}`, 'secret-a')).toBeNull()
    expect(openTouch(`${body}.`, 'secret-a')).toBeNull()
    expect(openTouch('junk', 'secret-a')).toBeNull()
    expect(sealed.length).toBeLessThan(400)
  })
})
