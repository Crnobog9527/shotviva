import 'server-only'

import { serverEnv } from '../../env'
import type { PostHogAccess } from './posthog-query'

// The read-only personal key and project (T74). Null until both are set; the page then says
// which variables to add instead of showing numbers.
export function posthogAccess(): PostHogAccess | null {
  const env = serverEnv()
  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) return null
  return { apiKey: env.POSTHOG_PERSONAL_API_KEY, projectId: env.POSTHOG_PROJECT_ID }
}

// Only the project id ever reaches the page (for the PostHog links), never the key.
export function posthogProjectId(): string | null {
  return posthogAccess()?.projectId ?? null
}
