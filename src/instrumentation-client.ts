import { initBrowserAnalytics } from '@/core/analytics/browser'
import { watchStaleBuild } from '@/core/app-update/stale-build'

// Runs before hydration (Next.js instrumentation-client): PostHog (cookieless) and Sentry.
initBrowserAnalytics()
// Failures of an older build (missing chunk, unknown Server Action) show the new-version banner (T90).
watchStaleBuild(window)

export { onRouterTransitionStart } from '@/core/analytics/browser'
