import { initBrowserAnalytics } from '@/core/analytics/browser'

// Runs before hydration (Next.js instrumentation-client): PostHog (cookieless) and Sentry.
initBrowserAnalytics()

export { onRouterTransitionStart } from '@/core/analytics/browser'
