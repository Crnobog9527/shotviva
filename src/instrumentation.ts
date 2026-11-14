import { onRequestError, registerSentry } from '@/core/analytics'

// Server start-up (Next.js instrumentation). Sentry for both runtimes; PostHog server events
// need no SDK set-up (core/analytics/server-track.ts). On Node, the Owner's 「网站报错异常」
// Feishu alert subscribes to server errors (T72); it is Node-only (R2, node:crypto).
export async function register(): Promise<void> {
  registerSentry()
  // NEXT_RUNTIME is a build-time constant Next.js inlines per runtime (the documented pattern in
  // its instrumentation guide), so the edge bundle drops this import; it is not a setting.
  // eslint-disable-next-line no-restricted-syntax
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerOwnerErrorAlerts } = await import('@/core/alerts')
    registerOwnerErrorAlerts()
  }
}

export { onRequestError }
