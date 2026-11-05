import { onRequestError, registerSentry } from '@/core/analytics'

// Server and edge start-up (Next.js instrumentation). Sentry only; PostHog server events
// need no SDK set-up (core/analytics/server-track.ts).
export function register(): void {
  registerSentry()
}

export { onRequestError }
