import 'server-only'

import { serverEnv } from '../../env'
import { publicEnv } from '../../public-env'
import type { PostHogAccess } from './posthog-query'
import type { PvuvAccess } from './pvuv-read'

// Whether PostHog is switched on (NEXT_PUBLIC_POSTHOG_ENABLED, core/public-env-schema.ts). Off:
// nothing is sent to it, so nothing is read from it either, and the page says so.
export const posthogOn = (): boolean => Boolean(publicEnv.NEXT_PUBLIC_POSTHOG_KEY)

// The read-only personal key and project (T74). Null until both are set, or while PostHog is
// switched off; the page then says why instead of showing numbers.
export function posthogAccess(): PostHogAccess | null {
  if (!posthogOn()) return null
  const env = serverEnv()
  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) return null
  return { apiKey: env.POSTHOG_PERSONAL_API_KEY, projectId: env.POSTHOG_PROJECT_ID }
}

// Only the project id ever reaches the page (for the PostHog links), never the key.
export function posthogProjectId(): string | null {
  return posthogAccess()?.projectId ?? null
}

// PVUV.ai's read access (ARCHITECTURE §5.1g): the site id and a read-only token, or null when
// either is unset; the template collection block then shows its database numbers only.
export function pvuvReadAccess(): PvuvAccess | null {
  const env = serverEnv()
  return env.PVUV_SITE && env.PVUV_READ_TOKEN ? { site: env.PVUV_SITE, token: env.PVUV_READ_TOKEN } : null
}
