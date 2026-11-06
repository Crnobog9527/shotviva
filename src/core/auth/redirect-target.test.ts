import { describe, expect, it } from 'vitest'

import { arrivedFrom, DEFAULT_AFTER_LOGIN, loginPath, sanitizeNext } from './redirect-target'

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

describe('arrivedFrom (the line under the login / sign-up title)', () => {
  const CONNECT = '/connect/graylum'

  it('names the home generator and the Graylum connect page in both languages', () => {
    expect(arrivedFrom('/', CONNECT)).toBe('home')
    expect(arrivedFrom('/zh', CONNECT)).toBe('home')
    expect(arrivedFrom('/connect/graylum?state=abc&return_to=x', CONNECT)).toBe('graylum')
    expect(arrivedFrom('/zh/connect/graylum/authorize', CONNECT)).toBe('graylum')
  })

  it('says nothing for any other page or an off-site next', () => {
    expect(arrivedFrom('/account', CONNECT)).toBeNull()
    expect(arrivedFrom('/zh/pricing', CONNECT)).toBeNull()
    expect(arrivedFrom('/connect/graylumx', CONNECT)).toBeNull()
    expect(arrivedFrom('//evil.example/connect/graylum', CONNECT)).toBeNull()
  })
})
