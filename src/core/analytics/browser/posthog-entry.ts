import { AnalyticsExtensions, SessionReplayExtensions, ToolbarExtensions } from 'posthog-js/dist/extension-bundles'
import posthog from 'posthog-js/dist/module.slim'

import { readConsent } from '../consent/store'
import { tagExperiments } from './experiments'
import { posthogConfig } from './posthog-config'

const { autocapture, historyAutocapture, heatmaps, webVitalsAutocapture } = AnalyticsExtensions

export function startPosthog(key: string) {
  posthog.init(key, {
    ...posthogConfig(readConsent(), window.location.pathname),
    // Keep existing page, click and performance data, and the consent-gated recorder. Shotviva
    // assigns its own experiments. The project doesn't record dead clicks or use the other SDK extensions.
    __extensionClasses: { autocapture, historyAutocapture, heatmaps, webVitalsAutocapture, ...SessionReplayExtensions, ...ToolbarExtensions },
    // The SDK's automatic first page view must see the same tags as our queued events.
    loaded: (client) => tagExperiments(client, document),
  })
  return posthog
}
