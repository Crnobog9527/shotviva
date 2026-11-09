import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { CODE_COOKIE, normalizeCode, percentZh } from './index'
import { captureCodeLink } from './link'

describe('code links', () => {
  it('preserves the page and other parameters and stores a private, normalized 30-day cookie', () => {
    const response = captureCodeLink(new NextRequest('https://test.example/zh/signup?ref=test&code=a123'))
    expect(response?.headers.get('location')).toBe('https://test.example/zh/signup?ref=test')
    expect(response?.cookies.get(CODE_COOKIE)).toMatchObject({ value: 'A123', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000, path: '/' })
  })

  it('leaves API lookup and authentication credentials alone', () => {
    for (const path of ['/api/codes/preview', '/auth/callback']) {
      expect(captureCodeLink(new NextRequest(`https://test.example${path}?code=ABCD`))).toBeNull()
    }
    expect(captureCodeLink(new NextRequest('https://test.example/?code=ABCD', {headers: {purpose:'prefetch'}}))).toBeNull()
  })

  it('accepts only 4–20 ASCII alphanumerics', () => {
    for (const raw of [null, 'ABC', '123456789012345678901', 'ＡBCＤ', 'abc-de', ' ABCD', 'ABCD\n']) {
      expect(normalizeCode(raw)).toBeNull()
    }
    expect(normalizeCode('aBc01234')).toBe('ABC01234')
  })

  it.each([[20,'8 折'],[25,'75 折'],[5,'95 折']])('formats %s percent off as %s', (percent, expected) => {
    expect(percentZh(Number(percent))).toBe(expected)
  })
})
