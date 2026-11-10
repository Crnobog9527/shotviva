// Kept apart from build-env.ts (zod) because the new-version banner imports DEV_APP_VERSION
// into every page's first-load JavaScript.

// The build's version (T90): Vercel's deployment id, else the commit, else `dev` (local `next
// dev`, CI builds). Inlined into client and server alike as NEXT_PUBLIC_APP_VERSION
// (next.config.ts), so a deployment's pages and its /api/version always agree, whatever its
// runtime environment says. Promote does not rebuild, so the id stays the same in production.
export const DEV_APP_VERSION = 'dev'

export function appVersion(source: Record<string, string | undefined>): string {
  return source.VERCEL_DEPLOYMENT_ID?.trim() || source.VERCEL_GIT_COMMIT_SHA?.trim() || DEV_APP_VERSION
}
