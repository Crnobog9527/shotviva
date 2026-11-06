import { describe, expect, it } from 'vitest'

import { parseConfirmParams } from '../../src/core/auth/flows/confirm-params'
import { buildLoginUrl, checkNext, parseLoginArgs } from './login-link'

const site = 'https://shotviva-git-validation-preview-simons-projects-bfe3e99f.vercel.app'
const hash = 'pkce_0a1b2c3d4e5f60718293a4b5c6d7e8f9'

describe('buildLoginUrl', () => {
  it('points at the existing /auth/confirm landing with a magiclink token hash', () => {
    const url = new URL(buildLoginUrl(site, hash, '/photos'))
    expect(url.origin + url.pathname).toBe(`${site}/auth/confirm`)
    expect(Object.fromEntries(url.searchParams)).toEqual({ token_hash: hash, type: 'magiclink', next: '/photos' })
    // What the route itself will parse out of it.
    expect(parseConfirmParams(url.searchParams)).toEqual({ tokenHash: hash, type: 'magiclink', flow: 'email' })
  })

  it('encodes a next path with a query', () => {
    const url = new URL(buildLoginUrl('http://localhost:3000', hash, '/admin/users?q=qa'))
    expect(url.searchParams.get('next')).toBe('/admin/users?q=qa')
  })

  it('refuses a token hash the route would reject', () => {
    expect(() => buildLoginUrl(site, 'short', '/account')).toThrow(/token hash/)
    expect(() => buildLoginUrl(site, 'has spaces in it', '/account')).toThrow(/token hash/)
  })
})

describe('checkNext', () => {
  it('defaults to the account page', () => {
    expect(checkNext(undefined)).toBe('/account')
  })

  it('refuses anything that could leave the site', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil', 'photos']) {
      expect(() => checkNext(next)).toThrow(/same-site path/)
    }
  })
})

describe('parseLoginArgs', () => {
  it('reads the persona and an optional --next in any position', () => {
    expect(parseLoginArgs(['qa-max'])).toEqual({ persona: 'qa-max', next: undefined })
    expect(parseLoginArgs(['--next', '/pricing', 'qa-free'])).toEqual({ persona: 'qa-free', next: '/pricing' })
  })

  it('rejects missing or extra arguments', () => {
    expect(() => parseLoginArgs([])).toThrow(/Usage/)
    expect(() => parseLoginArgs(['qa-max', 'qa-free'])).toThrow(/Usage/)
    expect(() => parseLoginArgs(['qa-max', '--next'])).toThrow(/needs a path/)
  })
})
