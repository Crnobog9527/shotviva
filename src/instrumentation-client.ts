import { initBrowserAnalytics } from '@/core/analytics/browser'
import { watchStaleBuild } from '@/core/app-update/stale-build'

// Catch early errors before hydration and schedule PostHog and Sentry after page load.
initBrowserAnalytics()
// Failures of an older build (missing chunk, unknown Server Action) show the new-version banner (T90).
watchStaleBuild(window)

export { onRouterTransitionStart } from '@/core/analytics/browser'
