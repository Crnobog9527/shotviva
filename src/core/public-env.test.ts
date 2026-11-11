import { describe, expect, it } from 'vitest'

import { withPublicDefaults } from './public-env'
import { parsePublicEnv, type RawPublicEnv } from './public-env-schema'

const unset: RawPublicEnv = {
  NEXT_PUBLIC_SITE_URL: undefined,
  NEXT_PUBLIC_PRICING_CATALOG_VERSION: undefined,
  NEXT_PUBLIC_VERCEL_ENV: undefined,
  NEXT_PUBLIC_VERCEL_BRANCH_URL: undefined,
  NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: undefined,
  NEXT_PUBLIC_SUPABASE_URL: undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
  NEXT_PUBLIC_HCAPTCHA_SITEKEY: undefined,
  NEXT_PUBLIC_POSTHOG_KEY: undefined,
  NEXT_PUBLIC_POSTHOG_HOST: undefined,
  NEXT_PUBLIC_SENTRY_DSN: undefined,
  NEXT_PUBLIC_ASSETS_BASE_URL: undefined,
  NEXT_PUBLIC_CDN_ORIGIN: undefined,
  NEXT_PUBLIC_APP_VERSION: undefined,
}

const configured: RawPublicEnv = {
  NEXT_PUBLIC_SITE_URL: 'https://shotviva.com',
  NEXT_PUBLIC_PRICING_CATALOG_VERSION: 'v2',
  NEXT_PUBLIC_VERCEL_ENV: 'preview',
  NEXT_PUBLIC_VERCEL_BRANCH_URL: 'shotviva-git-x.vercel.app',
  NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'shotviva.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  NEXT_PUBLIC_HCAPTCHA_SITEKEY: 'site-key',
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_key',
  NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
  NEXT_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
  NEXT_PUBLIC_ASSETS_BASE_URL: 'https://shotviva.com/assets//',
  NEXT_PUBLIC_CDN_ORIGIN: 'https://cdn.shotviva.com/',
  NEXT_PUBLIC_APP_VERSION: 'dpl_abc',
}

// The browser applies the defaults by hand (no zod in first-load JS); the schema is the contract.
describe('withPublicDefaults', () => {
  it.each([
    ['nothing set', unset],
    ['everything set', configured],
  ])('matches the schema with %s', (_, raw) => {
    expect(withPublicDefaults(raw)).toEqual(parsePublicEnv(raw))
  })
})

describe('parsePublicEnv', () => {
  it.each(['http://cdn.shotviva.com', 'https://cdn.shotviva.com/static', 'https://cdn.shotviva.com/?v=1'])(
    'accepts only an https origin as the CDN (%s is refused)',
    (origin) => {
      expect(() => parsePublicEnv({ ...unset, NEXT_PUBLIC_CDN_ORIGIN: origin })).toThrow(/NEXT_PUBLIC_CDN_ORIGIN/)
    },
  )

  it('names the bad key without echoing its value', () => {
    const bad = { ...unset, NEXT_PUBLIC_SENTRY_DSN: 'not-a-url-secret' }
    expect(() => parsePublicEnv(bad)).toThrow(/NEXT_PUBLIC_SENTRY_DSN/)
    expect(() => parsePublicEnv(bad)).not.toThrow(/not-a-url-secret/)
  })
})
