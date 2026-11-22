import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

import { appVersion, parseSentryBuildEnv } from './src/core/build-env'
import { rawPublicEnv } from './src/core/public-env'
import { parsePublicEnv } from './src/core/public-env-schema'
import { HTML_LIMITED_BOTS } from './src/core/seo/html-limited-bots'
import { indexingOpen, parseIndexingEnv, xRobotsTagRules } from './src/core/seo/indexing-env'
import { legacyUserRedirects } from './src/core/admin/users/legacy-redirects'
import { legacyHelpRedirects } from './src/core/support/legacy-redirects'
import { PRESIZED_DEVICE_SIZES, PRESIZED_IMAGE_SIZES, PRESIZED_PREFIX } from './src/core/presized'
import { assetsHeaders, assetsRemotePatterns, assetsRewrites, readAssetsEnv } from './src/core/storage/assets-env'
import { SITE_DOMAIN } from './src/site/domain'

// Messages are compiled to next-intl's compact form at build time (precompile), so pages ship and
// run its small formatter instead of the ICU parser (~9 KB gz on every page) and no message is
// parsed in the browser. Only the catalogs under src/site/messages are compiled; plain strings stay
// strings, so code that reads one as text (the zh manifest) is unaffected.
const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/site/i18n/request.ts',
  experimental: { messages: { path: './src/site/messages', format: 'json', locales: ['en', 'zh'], precompile: true } },
})

// PostHog US cloud behind our own origin (ARCHITECTURE §16.1), so ad blockers that block
// *.posthog.com do not drop events. Static assets (lazy-loaded extensions) have their own host.
const POSTHOG_INGEST = 'https://us.i.posthog.com'
const POSTHOG_ASSETS = 'https://us-assets.i.posthog.com'

// The NEXT_PUBLIC_* values are inlined into the bundles at build, so they are checked here,
// once: an invalid one fails the build (core/public-env-schema.ts). The browser reads them
// without zod (core/public-env.ts).
const publicEnvAtBuild = parsePublicEnv(rawPublicEnv)

// Pre-launch indexing switch (ARCHITECTURE §12.0), read at build: an invalid SITE_INDEXING fails
// the build, and changing it needs a redeploy. Closed → X-Robots-Tag on every response; open →
// still on every host but the canonical domain (*.vercel.app, previews).
const indexingIsOpen = indexingOpen(parseIndexingEnv(process.env))

// Template covers on the site's own /assets (ARCHITECTURE §8.3, T51): a rewrite to the public
// bucket's r2.dev origin, read at build; without R2_PUBLIC_ORIGIN there is no rewrite and the
// build still succeeds. next/image may load covers from the configured base.
const assets = readAssetsEnv(process.env)

const nextConfig: NextConfig = {
  // /_next/static from the static-file CDN when NEXT_PUBLIC_ASSET_CDN_URL is set (EdgeOne, which
  // forwards those paths to this site and caches them; core/public-env-schema.ts). Vercel already
  // answers them with Access-Control-Allow-Origin: *, which the cross-origin font files need.
  assetPrefix: publicEnvAtBuild.NEXT_PUBLIC_ASSET_CDN_URL,
  cacheComponents: true,
  // Vercel builds skip next build's type-check step: only main and validation/preview deploy, and
  // both receive code only through PRs whose required CI check ("lint · typecheck · test · build")
  // already ran `pnpm typecheck` on it. Local and CI builds (no VERCEL=1) still type-check.
  typescript: { ignoreBuildErrors: process.env.VERCEL === '1' },
  // Development action arguments can contain admin-only prompt bodies and private asset keys.
  logging: { serverFunctions: false },
  // The build's version, read by the new-version banner and /api/version (T90, core/app-update).
  env: { NEXT_PUBLIC_APP_VERSION: appVersion(process.env) },
  // Pages live under app/[locale]; an address matching no route at all has no root layout,
  // so app/global-not-found.tsx renders it (ARCHITECTURE §17).
  // inlineCss: every page's stylesheets arrive inside the HTML as <style>, so the first screen paints
  // as soon as the parser reaches it instead of waiting for 7 CSS files that share a slow link with
  // the scripts, fonts and pictures. Mobile LCP with throttling applied: / 2.76 -> 1.04 s, /zh
  // 2.68 -> 1.10 s, /login 2.96 -> 1.20 s (local A/B, PR #622). Global in Next 16.4 (no per-route
  // switch): a signed-in page's first full load carries the app's sheet in its HTML (~28 KB br)
  // instead of a cached file; moves inside the app are unchanged (Next uses <link> for those).
  experimental: { globalNotFound: true, inlineCss: true },
  // Search crawlers and Lighthouse get the cached page like a browser; only link-preview bots
  // keep Next's blocking-metadata render (src/core/seo/html-limited-bots.ts).
  htmlLimitedBots: HTML_LIMITED_BOTS,
  // Off for the site as a whole: with it on, every page's HTML also embeds a runtime prefetch
  // of itself (a second copy of the page tree and of the client messages, about 40% of the
  // marketing pages' HTML) and the server renders the page twice to produce it. The signed-in
  // app opts back in per segment (app/[locale]/(app)/layout.tsx), where its instant
  // navigations between tabs (T56) use it. Marketing links prefetch the cached page instead.
  partialPrefetching: false,
  // AVIF first (about a fifth smaller than WebP at the same quality, which matters most on the
  // slow cross-border link to mainland China), WebP for browsers without it. Each format is
  // encoded once per width and then cached: the stored covers are immutable, content-hashed.
  // The widths are the pre-sized copies' (core/presized): with NEXT_PUBLIC_PRESIZED_IMAGES_URL on,
  // a srcset names stored files, so it may only ask for widths that are stored. Next's defaults
  // minus 32–96 and 1920–3840; every slot of 128 px and up picks the same width as before.
  images: {
    formats: ['image/avif', 'image/webp'],
    imageSizes: [...PRESIZED_IMAGE_SIZES],
    deviceSizes: [...PRESIZED_DEVICE_SIZES],
    remotePatterns: assetsRemotePatterns(assets.NEXT_PUBLIC_ASSETS_BASE_URL),
  },
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
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          // Read cross-origin when the static-file CDN serves them (fonts need CORS).
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      // Instrument Serif (globals.css): content-hashed names too, the same rule.
      {
        source: '/fonts/:family(instrument-serif|geist)/:asset(.+\\.woff2)',
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
      // The pre-sized copies the build writes (scripts/presize-public.ts) of public/home and public/cases:
      // named after their source, which never changes under the same name, so the same rule. The
      // copies of public/intros and public/partners have no such convention and keep the default
      // (revalidated) caching.
      {
        source: `/${PRESIZED_PREFIX}/:width(w\\d+)/:dir(home|cases)/:asset(.+\\.(?:avif|webp))`,
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
      // Only while PostHog is switched on (NEXT_PUBLIC_POSTHOG_ENABLED); off, nothing proxies to it.
      ...(publicEnvAtBuild.NEXT_PUBLIC_POSTHOG_KEY
        ? [
            { source: '/ingest/static/:path*', destination: `${POSTHOG_ASSETS}/static/:path*` },
            { source: '/ingest/array/:path*', destination: `${POSTHOG_ASSETS}/array/:path*` },
            { source: '/ingest/:path*', destination: `${POSTHOG_INGEST}/:path*` },
          ]
        : []),
    ]
  },
  // Sentry's "bundle size optimizations" (excludeTracing, excludeDebugStatements), which its
  // config wrapper only applies under webpack: the site sends errors only (tracesSampleRate 0,
  // core/analytics/sentry-options.ts), so the tracing integration and the SDK's debug logging are
  // dead code. Sentry's own option sets the same two flags for server and client alike.
  // Browser SDK loaded after the page: 57 -> 32 KB gzip (PSI "unused JavaScript", 2026-11-21).
  compiler: { define: { __SENTRY_TRACING__: false, __SENTRY_DEBUG__: false } },
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
