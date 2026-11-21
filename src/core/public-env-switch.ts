// PostHog's one switch. Its own file, without zod: core/public-env.ts is in every page's
// first-load JavaScript and must not import the schema (public-env-schema.ts) for it.
export const POSTHOG_ENABLED_VALUE = 'true'

// The key counts only when NEXT_PUBLIC_POSTHOG_ENABLED is 'true'; otherwise PostHog is off
// everywhere (browser, server events, the /ingest rewrite, the admin reads) while the key stays.
export function withPostHogSwitch<T extends { NEXT_PUBLIC_POSTHOG_KEY: string; NEXT_PUBLIC_POSTHOG_ENABLED?: string | undefined }>(env: T): T {
  return env.NEXT_PUBLIC_POSTHOG_ENABLED === POSTHOG_ENABLED_VALUE ? env : { ...env, NEXT_PUBLIC_POSTHOG_KEY: '' }
}
