import { publicEnv } from '../public-env'
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub'

// Shared by the browser, Node and edge inits. Without a DSN `enabled` is false and every
// capture call is a no-op, so the app runs the same before the Owner creates the project.
export function sentryOptions() {
  const dsn = publicEnv.NEXT_PUBLIC_SENTRY_DSN
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: publicEnv.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    // Errors only: no performance tracing, no replay, no default PII (IP, cookies, user).
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  }
}
