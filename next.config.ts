import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

import { parseSentryBuildEnv } from './src/core/build-env'
import { indexingOpen, parseIndexingEnv, xRobotsTagRules } from './src/core/seo/indexing-env'
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

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // PostHog's API paths end in a slash (/i/v0/e/); a trailing-slash redirect would break them.
  skipTrailingSlashRedirect: true,
  async headers() {
    return xRobotsTagRules(indexingIsOpen, SITE_DOMAIN)
  },
  async rewrites() {
    return [
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
