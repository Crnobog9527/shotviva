import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

import { appVersion, parseSentryBuildEnv } from './src/core/build-env'
import { rawPublicEnv } from './src/core/public-env'
import { parsePublicEnv } from './src/core/public-env-schema'
import { indexingOpen, parseIndexingEnv, xRobotsTagRules } from './src/core/seo/indexing-env'
import { legacyUserRedirects } from './src/core/admin/users/legacy-redirects'
import { legacyHelpRedirects } from './src/core/support/legacy-redirects'
import { assetsHeaders, assetsRemotePatterns, assetsRewrites, readAssetsEnv } from './src/core/storage/assets-env'
import { SITE_DOMAIN } from './src/site/domain'

const withNextIntl = createNextIntlPlugin('./src/site/i18n/request.ts')

// PostHog US cloud behind our own origin (ARCHITECTURE §16.1), so ad blockers that block
// *.posthog.com do not drop events. Static assets (lazy-loaded extensions) have their own host.
const POSTHOG_INGEST = 'https://us.i.posthog.com'
const POSTHOG_ASSETS = 'https://us-assets.i.posthog.com'

// The NEXT_PUBLIC_* values are inlined into the bundles at build, so they are checked here,
// once: an invalid one fails the build (core/public-env-schema.ts). The browser reads them
// without zod (core/public-env.ts).
const publicValues = parsePublicEnv(rawPublicEnv)

// The asset host (core/cdn/cdn-origin.ts), production only: Next's /_next/static files load from
// it. crossOrigin makes those script and stylesheet requests CORS requests without credentials,
// the same mode as the fonts the stylesheets pull from it, so the browser keeps one connection to
// the host instead of two, and never stores the session cookies the CDN's attack protection sets.
// next/image stays on the site (/_next/image): measured from mainland China the CDN's nodes were
// slower than Vercel's, and the CDN does not vary its cache on Accept (AVIF vs WebP).
const cdnOrigin = publicValues.NEXT_PUBLIC_CDN_ORIGIN

// Pre-launch indexing switch (ARCHITECTURE §12.0), read at build: an invalid SITE_INDEXING fails
// the build, and changing it needs a redeploy. Closed → X-Robots-Tag on every response; open →
// still on every host but the canonical domain (*.vercel.app, previews).
const indexingIsOpen = indexingOpen(parseIndexingEnv(process.env))

// Template covers on the site's own /assets (ARCHITECTURE §8.3, T51): a rewrite to the public
// bucket's r2.dev origin, read at build; without R2_PUBLIC_ORIGIN there is no rewrite and the
// build still succeeds. next/image may load covers from the configured base.
const assets = readAssetsEnv(process.env)

const nextConfig: NextConfig = {
  ...(cdnOrigin ? { assetPrefix: cdnOrigin, crossOrigin: 'anonymous' as const } : {}),
  cacheComponents: true,
  // Development action arguments can contain admin-only prompt bodies and private asset keys.
  logging: { serverFunctions: false },
  // The build's version, read by the new-version banner and /api/version (T90, core/app-update).
  env: { NEXT_PUBLIC_APP_VERSION: appVersion(process.env) },
  // Pages live under app/[locale]; an address matching no route at all has no root layout,
  // so app/global-not-found.tsx renders it (ARCHITECTURE §17).
  experimental: { globalNotFound: true },
  // Off for the site as a whole: with it on, every page's HTML also embeds a runtime prefetch
  // of itself (a second copy of the page tree and of the client messages, about 40% of the
  // marketing pages' HTML) and the server renders the page twice to produce it. The signed-in
  // app opts back in per segment (app/[locale]/(app)/layout.tsx), where its instant
  // navigations between tabs (T56) use it. Marketing links prefetch the cached page instead.
  partialPrefetching: false,
  // AVIF first (about a fifth smaller than WebP at the same quality, which matters most on the
  // slow cross-border link to mainland China), WebP for browsers without it. Each format is
  // encoded once per width and then cached: the stored covers are immutable, content-hashed.
  images: { formats: ['image/avif', 'image/webp'], remotePatterns: assetsRemotePatterns(assets.NEXT_PUBLIC_ASSETS_BASE_URL) },
  poweredByHeader: false,
  // PostHog's API paths end in a slash (/i/v0/e/); a trailing-slash redirect would break them.
  skipTrailingSlashRedirect: true,
  // MiSans files are content-addressed (ARCHITECTURE §17): a changed font ships under a new
  // hash, so the woff2 subsets and the stylesheet can be cached for a year. NOTICE, README and
  // LICENSE.pdf keep the default caching.
  async headers() {
    return [
      ...xRobotsTagRules(indexingIsOpen, SITE_DOMAIN),
      ...assetsHeaders(),
      // Fonts are always fetched in CORS mode, and with the asset host on (core/cdn) the pages ask
      // for them from another origin, so they say who may read them. Vercel sends the same header
      // on static files by default; this keeps it from depending on that. One fixed value, so the
      // CDN can cache one copy.
      {
        source: '/fonts/misans/:asset(.+\\.(?:woff2|css))',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      // Instrument Serif (globals.css): content-hashed names too, the same rule.
      {
        source: '/fonts/instrument-serif/:asset(.+\\.woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      // The marketing pictures in public/home (hero scenes, demo sets, wish cards): cached for a
      // year, which /_next/image inherits for its resized copies (it keeps the larger of this and
      // minimumCacheTTL), so a return visit on a slow link downloads nothing. A changed picture
      // must ship under a new file name, never over an old one.
      {
        source: '/home/:asset(.+\\.webp)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // The inner landing pages' case pictures in public/cases: the same rule as public/home.
      {
        source: '/cases/:asset(.+\\.webp)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // The wordmark the Supabase auth emails load from https://shotviva.com (supabase/templates):
      // fetched by every mail client and image proxy, so cache it for a year. A changed wordmark
      // ships under a new file name, never over this one (old emails keep pointing at it).
      {
        source: '/brand/email/:asset(.+\\.png)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
  // The old /account/help pages open the account page's Help dialog instead (T68).
  async redirects() {
    return [...legacyHelpRedirects(), ...legacyUserRedirects()]
  },
  async rewrites() {
    return [
      ...assetsRewrites(assets.R2_PUBLIC_ORIGIN),
      { source: '/ingest/static/:path*', destination: `${POSTHOG_ASSETS}/static/:path*` },
      { source: '/ingest/array/:path*', destination: `${POSTHOG_ASSETS}/array/:path*` },
      { source: '/ingest/:path*', destination: `${POSTHOG_INGEST}/:path*` },
    ]
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

// Build-time only (src/core/build-env.ts). Without SENTRY_AUTH_TOKEN (local, CI) source maps
// are simply not uploaded; the runtime SDK is configured in src/core/analytics.
const sentryBuild = parseSentryBuildEnv(process.env)

export default withSentryConfig(withNextIntl(nextConfig), {
  org: sentryBuild.SENTRY_ORG,
  project: sentryBuild.SENTRY_PROJECT,
  authToken: sentryBuild.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !sentryBuild.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
  silent: !process.env.CI,
  telemetry: false,
})
