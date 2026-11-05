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
