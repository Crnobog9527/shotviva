import { describe, expect, it } from 'vitest'

import { DEFAULT_AFTER_LOGIN, loginPath, sanitizeNext } from './redirect-target'

describe('sanitizeNext', () => {
  it('keeps same-site paths with query', () => {
    expect(sanitizeNext('/account?tab=1')).toBe('/account?tab=1')
  })

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/ok\n',
    `/${'a'.repeat(600)}`,
  ])('falls back for %s', (value) => {
    expect(sanitizeNext(value)).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('drops fragments and normalises dot segments without leaving the site', () => {
    expect(sanitizeNext('/a/../account#x')).toBe('/account')
    expect(sanitizeNext('/.//evil.example')).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('builds an encoded login path', () => {
    expect(loginPath('/account?x=1')).toBe('/login?next=%2Faccount%3Fx%3D1')
  })
})
