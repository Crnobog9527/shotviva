import { describe, expect, it } from 'vitest'

import { allowlistedUrl, connectRedirectUrl, parseConnectRequest, pricingReturnTarget, topUpUrl } from './return-to'

const config = {
  returnToHosts: ['graylum.com', 'auth-staging.graylum.com'],
  connectCallbackPath: '/api/connectors/shotviva/callback' as const,
}
const CALLBACK = 'https://graylum.com/api/connectors/shotviva/callback'

describe('allowlistedUrl', () => {
  it.each([
    'https://graylum.com/chat/1',
    'https://AUTH-STAGING.graylum.com/x?y=1',
  ])('accepts %s', (url) => {
    expect(allowlistedUrl(url, config.returnToHosts)).not.toBeNull()
  })

  it.each([
    ['plain http', 'http://graylum.com/'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['lookalike suffix', 'https://graylum.com.evil.example/'],
    ['unlisted subdomain', 'https://evil.graylum.com/'],
    ['the old placeholder staging host', 'https://staging.graylum.com/'],
    ['credentials', 'https://graylum.com@evil.example/'],
    ['user info on the right host', 'https://u:p@graylum.com/'],
    ['explicit port', 'https://graylum.com:8443/'],
    ['ip address', 'https://127.0.0.1/'],
    ['protocol-relative', '//graylum.com/'],
    ['trailing dot', 'https://graylum.com./'],
    ['empty', ''],
  ])('rejects %s', (_, url) => {
    expect(allowlistedUrl(url, config.returnToHosts)).toBeNull()
  })

  it('rejects overlong URLs', () => {
    expect(allowlistedUrl(`https://graylum.com/${'a'.repeat(3000)}`, config.returnToHosts)).toBeNull()
  })
})

describe('parseConnectRequest', () => {
  it('defaults the callback to the first host', () => {
    expect(parseConnectRequest({ state: 'abcdefgh12' }, config)?.callback.toString()).toBe(CALLBACK)
  })

  it('accepts an allowlisted callback on the exact path', () => {
    const request = parseConnectRequest(
      { state: 'abcdefgh12', return_to: 'https://auth-staging.graylum.com/api/connectors/shotviva/callback' },
      config,
    )
    expect(request?.callback.hostname).toBe('auth-staging.graylum.com')
  })

  it.each([
    ['missing state', { return_to: CALLBACK }],
    ['short state', { state: 'abc' }],
    ['state with spaces', { state: 'abc def ghi' }],
    ['non-allowlisted host', { state: 'abcdefgh12', return_to: 'https://evil.example/api/connectors/shotviva/callback' }],
    ['other path on an allowed host', { state: 'abcdefgh12', return_to: 'https://graylum.com/redirect?to=evil' }],
  ])('rejects %s', (_, params) => {
    expect(parseConnectRequest(params, config)).toBeNull()
  })

  it('sends code and the untouched state back', () => {
    const request = parseConnectRequest({ state: 'st/at+e==' }, config)
    if (!request) throw new Error('expected a request')
    const url = new URL(connectRedirectUrl(request, 'CODE123'))
    expect(url.origin + url.pathname).toBe(CALLBACK)
    expect(url.searchParams.get('code')).toBe('CODE123')
    expect(url.searchParams.get('state')).toBe('st/at+e==')
  })
})

describe('top-up return', () => {
  it('builds /pricing?from=graylum with return_to', () => {
    const url = new URL(topUpUrl('https://shotviva.com', 'https://graylum.com/chat/9'))
    expect(url.pathname).toBe('/pricing')
    expect(url.searchParams.get('from')).toBe('graylum')
    expect(url.searchParams.get('return_to')).toBe('https://graylum.com/chat/9')
    expect(new URL(topUpUrl('https://shotviva.com')).searchParams.has('return_to')).toBe(false)
  })

  it('returns an allowlisted target with utm', () => {
    const target = pricingReturnTarget({ from: 'graylum', return_to: 'https://graylum.com/chat/9?x=1' }, config)
    const url = new URL(target ?? '')
    expect(url.pathname).toBe('/chat/9')
    expect(url.searchParams.get('x')).toBe('1')
    expect(url.searchParams.get('utm_source')).toBe('shotviva')
  })

  it('refuses a non-allowlisted return_to, or one not from graylum', () => {
    expect(pricingReturnTarget({ from: 'graylum', return_to: 'https://evil.example/' }, config)).toBeNull()
    expect(pricingReturnTarget({ from: 'graylum', return_to: 'http://graylum.com/' }, config)).toBeNull()
    expect(pricingReturnTarget({ from: 'other', return_to: 'https://graylum.com/' }, config)).toBeNull()
    expect(pricingReturnTarget({ return_to: 'https://graylum.com/' }, config)).toBeNull()
  })
})
