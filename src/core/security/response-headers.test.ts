import { describe, expect, it } from 'vitest'

import { PVUV_API, PVUV_SCRIPT_SRC } from '../analytics/browser/pvuv'
import { parsePublicEnv, type RawPublicEnv } from '../public-env-schema'

import { PVUV_ORIGINS, securityHeaderRules } from './response-headers'

const BLANK = { NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined, NEXT_PUBLIC_HCAPTCHA_SITEKEY: undefined, NEXT_PUBLIC_POSTHOG_KEY: undefined, NEXT_PUBLIC_POSTHOG_HOST: undefined, NEXT_PUBLIC_APP_VERSION: undefined }

const env = (extra: Partial<RawPublicEnv> = {}) => parsePublicEnv({
  ...BLANK,
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SENTRY_DSN: 'https://key:secret@o1.ingest.sentry.io/42',
  NEXT_PUBLIC_IMAGE_CDN_URL: 'https://img-eo.example.com',
  NEXT_PUBLIC_PRESIZED_IMAGES_URL: 'https://img-eo.example.com',
  ...extra,
})

const header = (rules: ReturnType<typeof securityHeaderRules>, key: string) =>
  rules.flatMap((rule) => rule.headers).find((h) => h.key === key)?.value

describe('securityHeaderRules', () => {
  it('enforces framing, base, plug-in and inline-handler limits on every path', () => {
    const rules = securityHeaderRules(env(), false)
    expect(rules).toHaveLength(1)
    expect(rules[0].source).toBe('/:path*')
    expect(header(rules, 'Content-Security-Policy')).toBe("base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src-attr 'none'")
    expect(header(rules, 'X-Frame-Options')).toBe('DENY')
    expect(header(rules, 'Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups')
  })

  it('adds the report-only policy only when asked, with origins and no DSN credentials', () => {
    const policy = header(securityHeaderRules(env({ NEXT_PUBLIC_PVUV_SITE: 'site' }), true), 'Content-Security-Policy-Report-Only')
    expect(policy).toContain('https://o1.ingest.sentry.io')
    expect(policy).not.toContain('secret')
    expect(policy).not.toContain('/42')
    expect(policy).toMatch(/script-src [^;]*https:\/\/www\.pvuv\.ai/)
    expect(policy).toMatch(/connect-src [^;]*https:\/\/in\.pvuv\.ai/)
    expect(policy).toMatch(/img-src [^;]*https:\/\/img-eo\.example\.com/)
    expect(header(securityHeaderRules(env(), true), 'Content-Security-Policy-Report-Only')).not.toContain('pvuv')
  })

  it('keeps the report-only policy off static files and the service worker', () => {
    const source = securityHeaderRules(env(), true)[1].source
    const pattern = new RegExp(`^${source.replace(/^\//, '\\/')}$`)
    expect(pattern.test('/pricing')).toBe(true)
    for (const path of ['/sw.js', '/_next/static/a.js', '/presized/w640/home/a.webp', '/api/version']) {
      expect(pattern.test(path)).toBe(false)
    }
  })

  it('names the same PVUV origins as the browser script', () => {
    expect(PVUV_ORIGINS).toEqual({ script: new URL(PVUV_SCRIPT_SRC).origin, api: new URL(PVUV_API).origin })
  })
})
