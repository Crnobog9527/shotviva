import { publicEnv } from '../public-env'
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub'

// Shared by the browser, Node and edge inits. Without a DSN `enabled` is false and every
// capture call is a no-op. One Sentry project receives Production and Preview, so the
// `environment` tag is what tells them apart: the server passes VERCEL_ENV; the browser only
// has NEXT_PUBLIC_VERCEL_ENV, which Vercel sets to the same value at build time.
export function sentryOptions(vercelEnv: string | undefined = publicEnv.NEXT_PUBLIC_VERCEL_ENV) {
  const dsn = publicEnv.NEXT_PUBLIC_SENTRY_DSN
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: vercelEnv ?? 'development',
    // Errors only: no performance tracing, no replay, no default PII (IP, cookies, user).
    tracesSampleRate: 0,
    // No sentry-trace / baggage headers on any request. Sentry adds them to every same-origin
    // fetch even with tracing off, and they survive a redirect: /api/files/:id 302s a paid work to
    // a signed R2 URL, so the browser's read of it (Share, transparency: result-file.ts) needed a
    // CORS preflight for those headers, which the bucket (Content-Type only) refuses, and Share
    // fell back to Download (Codex on the test site, 2026-11-08). Nothing reads the headers.
    tracePropagationTargets: [],
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  }
}
