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
    expect(() => assertPending({ ...pending, confirmation_sent_at: '2026-11-27T10:59:00Z' }, 'a@b.co', now)).toThrow(/older than 60 minutes/)
  })

  it('follows a different otp_expiry', () => {
    const old = { ...pending, confirmation_sent_at: '2026-11-27T10:00:00Z' }
    expect(assertPending(old, 'a@b.co', now, 86400)).toBe(hash)
  })
})

describe('assertTestDbUrl', () => {
  const pooler = `postgresql://postgres.${PREVIEW_REF}:pw@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`

  it('returns explicit fields for the session pooler or the direct host', () => {
    expect(assertTestDbUrl(pooler)).toEqual({
      host: 'aws-1-ap-southeast-1.pooler.supabase.com',
      port: 5432,
      user: `postgres.${PREVIEW_REF}`,
      password: 'pw',
      database: 'postgres',
    })
    const direct = `postgresql://postgres:p%40ss@db.${PREVIEW_REF}.supabase.co:5432/postgres`
    expect(assertTestDbUrl(direct)).toMatchObject({ host: `db.${PREVIEW_REF}.supabase.co`, user: 'postgres', password: 'p@ss' })
  })

  it('refuses any query string or fragment (pg would let ?user= / ?host= override the checked parts)', () => {
    const encodedProdUser = `postgres.%69${PROD.slice(1)}`
    expect(() => assertTestDbUrl(`${pooler}?user=${encodedProdUser}`)).toThrow(/production|query/)
    expect(() => assertTestDbUrl(`${pooler}?host=aws-0-eu-west-1.pooler.supabase.com`)).toThrow(/query/)
    expect(() => assertTestDbUrl(`${pooler}?options=-c%20search_path%3Dx`)).toThrow(/query/)
    expect(() => assertTestDbUrl(`${pooler}?hostaddr=10.0.0.1&port=6543`)).toThrow(/query/)
    expect(() => assertTestDbUrl(`${pooler}?sslmode=disable`)).toThrow(/query/)
    expect(() => assertTestDbUrl(`${pooler}?`)).toThrow(/query/)
    expect(() => assertTestDbUrl(`${pooler}#x`)).toThrow(/query/)
  })

  it('refuses production anywhere, also percent-encoded', () => {
    expect(() => assertTestDbUrl(pooler.replace(PREVIEW_REF, PROD))).toThrow(/production/)
    expect(() => assertTestDbUrl(`postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`)).toThrow(/production/)
    expect(() => assertTestDbUrl(`${pooler}?user=postgres.%69${PROD.slice(1)}`)).toThrow(/production/)
    expect(() => assertTestDbUrl(pooler.replace(':pw@', `:%69${PROD.slice(1)}@`))).toThrow(/production/)
  })

  it('refuses other projects, other hosts, other databases and ports, and a test ref in the wrong place', () => {
    const other = 'abcdefghijklmnopqrst'
    expect(() => assertTestDbUrl(pooler.replace(PREVIEW_REF, other))).toThrow(/not the test project/)
    expect(() => assertTestDbUrl(`postgresql://postgres.${PREVIEW_REF}:pw@evil.example.com:5432/postgres`)).toThrow(/not the test project/)
    expect(() => assertTestDbUrl(`postgresql://postgres:pw@db.${other}.supabase.co:5432/${PREVIEW_REF}`)).toThrow(/not the test project/)
    expect(() => assertTestDbUrl(`postgresql://postgres:pw@aws-1-x.pooler.supabase.com:5432/postgres`)).toThrow(/not the test project/)
    expect(() => assertTestDbUrl(pooler.replace(/\/postgres$/, '/other'))).toThrow(/postgres database/)
    expect(() => assertTestDbUrl(pooler.replace(':5432', ':1234'))).toThrow(/port/)
    expect(() => assertTestDbUrl(pooler.replace(':pw@', '@'))).toThrow(/password/)
    expect(() => assertTestDbUrl(`https://${PREVIEW_REF}.supabase.co`)).toThrow(/postgresql/)
    expect(() => assertTestDbUrl(undefined)).toThrow(/missing/)
    expect(() => assertTestDbUrl('not a url')).toThrow(/not a URL/)
    expect(() => assertTestDbUrl('postgresql://%E0%A4%A@x/postgres')).toThrow(/percent-escape/)
  })

  it('never echoes the password', () => {
    expect(() => assertTestDbUrl(`postgresql://postgres:s3cret-pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres`)).toThrow()
    try {
      assertTestDbUrl(`postgresql://postgres:s3cret-pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres`)
    } catch (error) {
      expect(String(error)).not.toContain('s3cret-pw')
    }
  })
})
