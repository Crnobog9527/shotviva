import { describe, expect, it } from 'vitest'

import { parseConfirmParams } from '../../src/core/auth/flows/confirm-params'
import { assertNotPersona, assertPending, assertTestDbUrl, buildConfirmLink, landingPath, parseLinkArgs, QA_HOSTS } from './signup-link'
import { PREVIEW_REF } from './target'

const USAGE = 'test usage'
const hash = 'pkce_' + 'a'.repeat(56)
const PROD = 'irbqamjuazkkyvnnzupf'

describe('parseLinkArgs', () => {
  it('defaults to the qa-user host and normalises the email', () => {
    expect(parseLinkArgs([' New+1@Resend.dev '], USAGE)).toEqual({ email: 'new+1@resend.dev', host: 'user', next: undefined })
  })

  it('takes --host and --next in any order', () => {
    expect(parseLinkArgs(['--next', '/zh/account', 'a@b.co', '--host', 'admin'], USAGE)).toEqual({
      email: 'a@b.co',
      host: 'admin',
      next: '/zh/account',
    })
  })

  it('refuses unknown hosts, off-site next and bad usage', () => {
    expect(() => parseLinkArgs(['a@b.co', '--host', 'prod'], USAGE)).toThrow(/--host must be/)
    expect(() => parseLinkArgs(['a@b.co', '--next', 'https://evil.example'], USAGE)).toThrow(/same-site/)
    expect(() => parseLinkArgs(['a@b.co', '--host'], USAGE)).toThrow(/needs a value/)
    expect(() => parseLinkArgs([], USAGE)).toThrow(/Usage/)
    expect(() => parseLinkArgs(['a@b.co', 'c@d.co'], USAGE)).toThrow(/Usage/)
    expect(() => parseLinkArgs(['not-an-email'], USAGE)).toThrow(/Not an email/)
  })
})

describe('assertNotPersona', () => {
  it('sends QA personas to qa:login', () => {
    expect(() => assertNotPersona('qa-free@shotviva.com')).toThrow(/qa:login qa-free/)
    expect(() => assertNotPersona('delivered+x@resend.dev')).not.toThrow()
  })
})

describe('buildConfirmLink', () => {
  it('renders what confirm-signup.html renders from RedirectTo and TokenHash', () => {
    const link = buildConfirmLink('user', hash, '/account')
    expect(link).toBe(`${QA_HOSTS.user}/auth/confirm?next=%2Faccount&token_hash=${hash}&type=signup`)
    const url = new URL(link)
    expect(url.pathname).toBe('/auth/confirm')
    // What the route itself will parse out of it.
    expect(parseConfirmParams(url.searchParams)).toEqual({ tokenHash: hash, type: 'signup', flow: 'email' })
    expect(url.searchParams.get('next')).toBe('/account')
  })

  it('uses the chosen test host', () => {
    expect(new URL(buildConfirmLink('admin', hash, '/account')).origin).toBe('https://shotviva-qa-admin.vercel.app')
    expect(new URL(buildConfirmLink('preview', hash, '/account')).hostname).toMatch(/\.vercel\.app$/)
  })

  it('refuses a stored token the route would reject', () => {
    expect(() => buildConfirmLink('user', 'short', '/account')).toThrow(/unexpected shape/)
    expect(() => buildConfirmLink('user', 'x&type=recovery', '/account')).toThrow(/unexpected shape/)
  })
})

describe('landingPath', () => {
  it('keeps --next, else the account page in the account language', () => {
    expect(landingPath('/photos', 'zh')).toBe('/photos')
    expect(landingPath(undefined, 'zh')).toBe('/zh/account')
    expect(landingPath(undefined, null)).toBe('/account')
    expect(landingPath(undefined, 'xx')).toBe('/account')
  })
})

describe('assertPending', () => {
  const now = Date.parse('2026-11-27T12:00:00Z')
  const pending = { email_confirmed_at: null, confirmation_token: hash, confirmation_sent_at: '2026-11-27T11:50:00Z' }

  it('returns the stored token of a pending sign-up', () => {
    expect(assertPending(pending, 'a@b.co', now)).toBe(hash)
  })

  it('refuses missing, confirmed, tokenless and expired accounts', () => {
    expect(() => assertPending(undefined, 'a@b.co', now)).toThrow(/No account/)
    expect(() => assertPending({ ...pending, email_confirmed_at: '2026-11-27T11:55:00Z' }, 'a@b.co', now)).toThrow(/already confirmed/)
    expect(() => assertPending({ ...pending, confirmation_token: '' }, 'a@b.co', now)).toThrow(/no pending/)
    expect(() => assertPending({ ...pending, confirmation_sent_at: null }, 'a@b.co', now)).toThrow(/confirmation_sent_at/)
    expect(() => assertPending({ ...pending, confirmation_sent_at: '2026-11-26T11:00:00Z' }, 'a@b.co', now)).toThrow(/older than a day/)
  })
})

describe('assertTestDbUrl', () => {
  const pooler = `postgresql://postgres.${PREVIEW_REF}:pw@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`

  it('accepts the test project via the session pooler or the direct host', () => {
    expect(assertTestDbUrl(pooler)).toBe(pooler)
    const direct = `postgresql://postgres:pw@db.${PREVIEW_REF}.supabase.co:5432/postgres`
    expect(assertTestDbUrl(direct)).toBe(direct)
  })

  it('drops sslmode so the script decides TLS', () => {
    expect(assertTestDbUrl(`${pooler}?sslmode=disable`)).toBe(pooler)
  })

  it('refuses production anywhere in the string', () => {
    expect(() => assertTestDbUrl(pooler.replace(PREVIEW_REF, PROD))).toThrow(/production/)
    expect(() => assertTestDbUrl(`postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`)).toThrow(/production/)
  })

  it('refuses other projects, other hosts and a test ref in the wrong place', () => {
    const other = 'abcdefghijklmnopqrst'
    expect(() => assertTestDbUrl(pooler.replace(PREVIEW_REF, other))).toThrow(/not the test project/)
    expect(() => assertTestDbUrl(`postgresql://postgres.${PREVIEW_REF}:pw@evil.example.com:5432/postgres`)).toThrow(/not the test project/)
    expect(() => assertTestDbUrl(`postgresql://postgres:pw@db.${other}.supabase.co:5432/${PREVIEW_REF}`)).toThrow(/not the test project/)
    expect(() => assertTestDbUrl(`postgresql://postgres:pw@aws-1-x.pooler.supabase.com:5432/postgres`)).toThrow(/not the test project/)
    expect(() => assertTestDbUrl(`https://${PREVIEW_REF}.supabase.co`)).toThrow(/postgresql/)
    expect(() => assertTestDbUrl(undefined)).toThrow(/missing/)
    expect(() => assertTestDbUrl('not a url')).toThrow(/not a URL/)
  })

  it('never echoes the password', () => {
    try {
      assertTestDbUrl(`postgresql://postgres:s3cret-pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres`)
    } catch (error) {
      expect(String(error)).not.toContain('s3cret-pw')
    }
  })
})
