import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

import { parseSentryBuildEnv } from './src/core/build-env'
import { indexingOpen, parseIndexingEnv, xRobotsTagRules } from './src/core/seo/indexing-env'
import { assetsHeaders, assetsRemotePatterns, assetsRewrites, readAssetsEnv } from './src/core/storage/assets-env'
import { SITE_DOMAIN } from './src/site/domain'

const withNextIntl = createNextIntlPlugin('./src/site/i18n/request.ts')

// PostHog US cloud behind our own origin (ARCHITECTURE §16.1), so ad blockers that block
// *.posthog.com do not drop events. Static assets (lazy-loaded extensions) have their own host.
const POSTHOG_INGEST = 'https://us.i.posthog.com'
const POSTHOG_ASSETS = 'https://us-assets.i.posthog.com'

// Pre-launch indexing switch (ARCHITECTURE §12.0), read at build: an invalid SITE_INDEXING fails
// the build, and changing it needs a redeploy. Closed → X-Robots-Tag on every response; open →
// still on every host but the canonical domain (*.vercel.app, previews).
const indexingIsOpen = indexingOpen(parseIndexingEnv(process.env))

// Template covers on the site's own /assets (ARCHITECTURE §8.3, T51): a rewrite to the public
// bucket's r2.dev origin, read at build; without R2_PUBLIC_ORIGIN there is no rewrite and the
// build still succeeds. next/image may load covers from the configured base.
const assets = readAssetsEnv(process.env)

const nextConfig: NextConfig = {
  cacheComponents: true,
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
      {
        source: '/fonts/misans/:asset(.+\\.(?:woff2|css))',
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
