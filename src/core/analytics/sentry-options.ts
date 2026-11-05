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
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  }
}
