import { z } from 'zod'

// Build-time only: Sentry source-map upload (next.config.ts). Kept apart from core/env.ts
// because next.config.ts runs outside React's server environment and cannot load a
// `server-only` module; core/env.ts merges this schema so the server env names every key.
// Vercel's Sentry integration writes these for Production and Preview. All optional: without
// the token (local, CI) the upload is skipped and the build still succeeds.
const blankAsUnset = (value: unknown) => (value === '' ? undefined : value)
const optional = z.preprocess(blankAsUnset, z.string().min(1).optional())

export const sentryBuildEnvSchema = z.object({
  SENTRY_AUTH_TOKEN: optional,
  SENTRY_ORG: optional,
  SENTRY_PROJECT: optional,
})

export type SentryBuildEnv = z.infer<typeof sentryBuildEnvSchema>

export function parseSentryBuildEnv(source: Record<string, string | undefined>): SentryBuildEnv {
  const result = sentryBuildEnvSchema.safeParse(source)
  if (!result.success) throw new Error(`Invalid Sentry build environment: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`)
  return result.data
}

// The build's version (T90): Vercel's deployment id, else the commit, else `dev` (local `next
// dev`, CI builds). Inlined into client and server alike as NEXT_PUBLIC_APP_VERSION
// (next.config.ts), so a deployment's pages and its /api/version always agree, whatever its
// runtime environment says. Promote does not rebuild, so the id stays the same in production.
export const DEV_APP_VERSION = 'dev'

export function appVersion(source: Record<string, string | undefined>): string {
  return source.VERCEL_DEPLOYMENT_ID?.trim() || source.VERCEL_GIT_COMMIT_SHA?.trim() || DEV_APP_VERSION
}
