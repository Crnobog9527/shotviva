import posthog from 'posthog-js'

import { readConsent } from '../consent/store'
import { tagExperiments } from './experiments'
import { posthogConfig } from './posthog-config'

export function startPosthog(key: string) {
  posthog.init(key, {
    ...posthogConfig(readConsent(), window.location.pathname),
    // The SDK's automatic first page view must see the same tags as our queued events.
    loaded: (client) => tagExperiments(client, document),
  })
  return posthog
}
