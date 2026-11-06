import { describe, expect, it } from 'vitest'

import { assertQaTarget, DEFAULT_SITE_URL, parseExtraRefs, PREVIEW_REF, PRODUCTION_REFS, resolveSiteUrl } from './target'

const jwt = (claims: Record<string, unknown>) =>
  ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.')

const previewUrl = `https://${PREVIEW_REF}.supabase.co`
const otherRef = 'abcdefghijklmnopqrst'

describe('assertQaTarget', () => {
  it('accepts the preview project', () => {
    expect(assertQaTarget({ supabaseUrl: previewUrl, serviceKey: 'sb_secret_x' })).toBe(PREVIEW_REF)
    expect(assertQaTarget({ supabaseUrl: previewUrl, serviceKey: jwt({ role: 'service_role', ref: PREVIEW_REF }) })).toBe(
      PREVIEW_REF,
    )
  })

  it('refuses any other project unless it is listed', () => {
    const input = { supabaseUrl: `https://${otherRef}.supabase.co`, serviceKey: 'sb_secret_x' }
    expect(() => assertQaTarget(input)).toThrow(/Refusing to run against abcdefghijklmnopqrst/)
    expect(assertQaTarget({ ...input, extraRefs: ` ${otherRef} ` })).toBe(otherRef)
  })

  it('refuses a local stack unless `local` is listed', () => {
    const input = { supabaseUrl: 'http://127.0.0.1:54321', serviceKey: jwt({ role: 'service_role' }) }
    expect(() => assertQaTarget(input)).toThrow(/Refusing to run against local/)
    expect(assertQaTarget({ ...input, extraRefs: 'local' })).toBe('local')
  })

  it('refuses hosts that are not Supabase projects', () => {
    for (const supabaseUrl of ['https://db.shotviva.com', `http://${PREVIEW_REF}.supabase.co`, 'not a url']) {
      expect(() => assertQaTarget({ supabaseUrl, serviceKey: 'sb_secret_x', extraRefs: 'local' })).toThrow()
    }
  })

  it('refuses a key from another project or without the service role', () => {
    const wrongRef = jwt({ role: 'service_role', ref: otherRef })
    expect(() => assertQaTarget({ supabaseUrl: previewUrl, serviceKey: wrongRef })).toThrow(/different project/)
    const anon = jwt({ role: 'anon', ref: PREVIEW_REF })
    expect(() => assertQaTarget({ supabaseUrl: previewUrl, serviceKey: anon })).toThrow(/not a service-role key/)
    expect(() => assertQaTarget({ supabaseUrl: previewUrl, serviceKey: 'sb_publishable_x' })).toThrow(/publishable/)
  })

  it('rejects malformed extra refs', () => {
    expect(() => parseExtraRefs('prod;drop')).toThrow(/invalid entry/)
    expect(parseExtraRefs(undefined)).toEqual([])
  })

  it('never lets an extra ref re-allow production', () => {
    // The production project does not exist yet; this pins the precedence for when it does.
    const mutable = PRODUCTION_REFS as string[]
    mutable.push(otherRef)
    try {
      const input = { supabaseUrl: `https://${otherRef}.supabase.co`, serviceKey: 'sb_secret_x', extraRefs: otherRef }
      expect(() => assertQaTarget(input)).toThrow(/production/)
    } finally {
      mutable.pop()
    }
  })
})

describe('resolveSiteUrl', () => {
  it('defaults to the validation preview', () => {
    expect(resolveSiteUrl(undefined, PREVIEW_REF)).toBe(DEFAULT_SITE_URL)
    expect(resolveSiteUrl('', PREVIEW_REF)).toBe(DEFAULT_SITE_URL)
  })

  it('takes another preview deployment or a local server, as an origin', () => {
    expect(resolveSiteUrl('https://shotviva-abc.vercel.app/some/path', PREVIEW_REF)).toBe('https://shotviva-abc.vercel.app')
    expect(resolveSiteUrl('http://localhost:3000', 'local')).toBe('http://localhost:3000')
  })

  it('refuses production and other sites', () => {
    for (const raw of ['https://shotviva.com', 'https://www.shotviva.com', 'http://x.vercel.app', 'nope']) {
      expect(() => resolveSiteUrl(raw, PREVIEW_REF)).toThrow()
    }
  })

  it('keeps a local database on a local site', () => {
    expect(() => resolveSiteUrl(undefined, 'local')).toThrow(/local site/)
  })
})
