import { z } from 'zod'

// The zod contract of the client-safe variables (core/public-env.ts reads them). It runs where
// the values are fixed: next.config.ts parses them at build, when Next.js inlines every
// NEXT_PUBLIC_* into the bundles, so an invalid value fails the build. Browser code never
// imports this file, which keeps zod out of every page's first-load JavaScript.
export const publicEnvSchema = z.object({
  // Optional override of the deployment origin; see core/site-url.ts for the fallback order.
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  NEXT_PUBLIC_PRICING_CATALOG_VERSION: z.enum(['v1', 'v2']).optional(),
  // Vercel system variables (exposed automatically to Next.js builds on Vercel). Hosts, no scheme.
  NEXT_PUBLIC_VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  NEXT_PUBLIC_VERCEL_BRANCH_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
  // Local `supabase start` defaults, so builds and tests work without a .env.local.
  NEXT_PUBLIC_SUPABASE_URL: z.url().default('http://127.0.0.1:54321'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(''),
  // Empty means captcha is off (local dev); Supabase Auth enforces it when configured there.
  NEXT_PUBLIC_HCAPTCHA_SITEKEY: z.string().default(''),
  // PostHog project key: public by design (it can only write events). Empty means analytics
  // is off (local dev, CI); the host is the US ingestion host the /ingest rewrite targets.
  NEXT_PUBLIC_POSTHOG_KEY: z.string().default(''),
  NEXT_PUBLIC_POSTHOG_HOST: z.url().default('https://us.i.posthog.com'),
  // Sentry DSN, public by design. Unset means Sentry stays off in browser, server and edge.
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  // Where covers are read from, no trailing slash. Cover URLs are this + '/covers/…'
  // (ARCHITECTURE §8.3「公开读」): production https://shotviva.com/assets, the site's own path,
  // rewritten to the public bucket (R2_PUBLIC_ORIGIN, next.config.ts); preview may use the
  // bucket's r2.dev URL directly.
  NEXT_PUBLIC_ASSETS_BASE_URL: z
    .url()
    .transform((url) => url.replace(/\/+$/, ''))
    .optional(),
  // The switch for serving covers through the image CDN (Tencent EdgeOne, img-eo): its origin,
  // e.g. https://img-eo.shotviva.com, no trailing slash. Set: cover srcsets point at
  // <this>/_next/image?… (the CDN forwards only /_next/image to this site and caches the result);
  // unset: the site's own /_next/image, as before. Read at build, so a change needs a redeploy.
  NEXT_PUBLIC_IMAGE_CDN_URL: z
    .url({ protocol: /^https$/ })
    .transform((url) => url.replace(/\/+$/, ''))
    .optional(),
  // The static-file CDN switch (same EdgeOne host as images, plan A1 phase 2): Next's assetPrefix
  // for /_next/static (scripts, styles, next/font files) plus the self-hosted fonts in public/fonts
  // (MiSans, Instrument Serif). Unset: everything from this site, as before. Read at build.
  NEXT_PUBLIC_ASSET_CDN_URL: z
    .url({ protocol: /^https$/ })
    .transform((url) => url.replace(/\/+$/, ''))
    .optional(),
  // This build's version (T90): set by next.config.ts from the deployment id; `dev` locally.
  NEXT_PUBLIC_APP_VERSION: z.string().min(1).default('dev'),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>
export type RawPublicEnv = { [K in keyof PublicEnv]: string | undefined }

// Names the bad keys, never their values.
export function parsePublicEnv(raw: RawPublicEnv): PublicEnv {
  const result = publicEnvSchema.safeParse(raw)
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid public environment: ${keys}`)
  }
  return result.data
}
