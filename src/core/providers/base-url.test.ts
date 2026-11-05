import { describe, expect, it } from 'vitest'

import { assertPublicBaseUrl, isBlockedAddress, parseBaseUrl } from './base-url'
import { ProviderSettingError } from './setting-error'

function reasonOf(run: () => unknown): string | null {
  try {
    run()
    return null
  } catch (error) {
    return error instanceof ProviderSettingError ? error.reason : 'other'
  }
}

describe('parseBaseUrl', () => {
  it('accepts public https addresses and drops a trailing slash', () => {
    expect(parseBaseUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1')
    expect(parseBaseUrl(' https://relay.example.com/openai/v1 ')).toBe('https://relay.example.com/openai/v1')
    expect(parseBaseUrl('https://8.8.8.8/v1')).toBe('https://8.8.8.8/v1')
  })

  it('rejects http', () => {
    expect(reasonOf(() => parseBaseUrl('http://api.openai.com/v1'))).toBe('base_url_not_https')
  })

  it.each([
    'https://localhost/v1',
    'https://api.localhost/v1',
    'https://127.0.0.1/v1',
    'https://2130706433/v1',
    'https://10.1.2.3/v1',
    'https://172.20.0.1/v1',
    'https://192.168.1.10/v1',
    'https://169.254.169.254/latest',
    'https://100.64.0.1/v1',
    'https://0.0.0.0/v1',
    'https://[::1]/v1',
    'https://[fd00::1]/v1',
    'https://[fe80::1]/v1',
    'https://[::ffff:10.0.0.1]/v1',
    'https://printer.local/v1',
    'https://metadata.google.internal/v1',
    'https://intranet/v1',
  ])('rejects the local, private or reserved host %s', (url) => {
    expect(reasonOf(() => parseBaseUrl(url))).toBe('base_url_private')
  })

  it('rejects credentials, queries, fragments and garbage', () => {
    expect(reasonOf(() => parseBaseUrl('https://user:pw@api.openai.com/v1'))).toBe('base_url_invalid')
    expect(reasonOf(() => parseBaseUrl('https://api.openai.com/v1?x=1'))).toBe('base_url_invalid')
    expect(reasonOf(() => parseBaseUrl('https://api.openai.com/v1#x'))).toBe('base_url_invalid')
    expect(reasonOf(() => parseBaseUrl('not a url'))).toBe('base_url_invalid')
  })
})

describe('assertPublicBaseUrl', () => {
  it('rejects a public-looking name that resolves to a private address', async () => {
    const resolve = async () => ['93.184.216.34', '10.0.0.5']
    await expect(assertPublicBaseUrl('https://relay.example.com/v1', resolve)).rejects.toMatchObject({ reason: 'base_url_private' })
  })

  it('rejects a name that does not resolve', async () => {
    const resolve = async () => {
      throw new Error('ENOTFOUND')
    }
    await expect(assertPublicBaseUrl('https://nope.example.com/v1', resolve)).rejects.toMatchObject({ reason: 'base_url_unresolvable' })
  })

  it('passes a name that resolves only to public addresses', async () => {
    const resolve = async () => ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']
    await expect(assertPublicBaseUrl('https://relay.example.com/v1/', resolve)).resolves.toBe('https://relay.example.com/v1')
  })

  it('treats anything that is not an IP address as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true)
    expect(isBlockedAddress('1.1.1.1')).toBe(false)
  })
})
