import type { PublicEnv, RawPublicEnv } from './public-env-schema'

export type { PublicEnv } from './public-env-schema'

// Client-safe variables only. Next.js inlines NEXT_PUBLIC_* at build time solely
// when referenced as literal `process.env.NEXT_PUBLIC_X`, so each key is spelled out.
export const rawPublicEnv: RawPublicEnv = {
  NEXT_PUBLIC_PRICING_CATALOG_VERSION: process.env.NEXT_PUBLIC_PRICING_CATALOG_VERSION || undefined,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV || undefined,
  NEXT_PUBLIC_VERCEL_BRANCH_URL: process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL || undefined,
  NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || undefined,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_HCAPTCHA_SITEKEY: process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST || undefined,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  NEXT_PUBLIC_ASSETS_BASE_URL: process.env.NEXT_PUBLIC_ASSETS_BASE_URL || undefined,
  NEXT_PUBLIC_CDN_ORIGIN: process.env.NEXT_PUBLIC_CDN_ORIGIN || undefined,
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
}

// The schema's defaults and trailing-slash trim, without zod: this module is in every page's
// first-load JavaScript, and zod with the schema was about 30 KB gzip of it (mobile Lighthouse,
// 2026-11-11). The values are validated by publicEnvSchema at build (next.config.ts), when they
// are inlined; public-env.test.ts keeps this function equal to the schema's parse.
export function withPublicDefaults(raw: RawPublicEnv): PublicEnv {
  return {
    ...raw,
    NEXT_PUBLIC_PRICING_CATALOG_VERSION: raw.NEXT_PUBLIC_PRICING_CATALOG_VERSION as PublicEnv['NEXT_PUBLIC_PRICING_CATALOG_VERSION'],
    NEXT_PUBLIC_VERCEL_ENV: raw.NEXT_PUBLIC_VERCEL_ENV as PublicEnv['NEXT_PUBLIC_VERCEL_ENV'],
    NEXT_PUBLIC_SUPABASE_URL: raw.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: raw.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    NEXT_PUBLIC_HCAPTCHA_SITEKEY: raw.NEXT_PUBLIC_HCAPTCHA_SITEKEY ?? '',
    NEXT_PUBLIC_POSTHOG_KEY: raw.NEXT_PUBLIC_POSTHOG_KEY ?? '',
    NEXT_PUBLIC_POSTHOG_HOST: raw.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    NEXT_PUBLIC_ASSETS_BASE_URL: raw.NEXT_PUBLIC_ASSETS_BASE_URL?.replace(/\/+$/, ''),
    NEXT_PUBLIC_CDN_ORIGIN: raw.NEXT_PUBLIC_CDN_ORIGIN?.replace(/\/+$/, ''),
    NEXT_PUBLIC_APP_VERSION: raw.NEXT_PUBLIC_APP_VERSION ?? 'dev',
  }
}

export const publicEnv: PublicEnv = withPublicDefaults(rawPublicEnv)

export const pricingV2 = publicEnv.NEXT_PUBLIC_PRICING_CATALOG_VERSION === 'v2'
