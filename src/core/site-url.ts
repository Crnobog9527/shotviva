import { publicEnv, type PublicEnv } from './public-env'

type OriginEnv = Pick<
  PublicEnv,
  | 'NEXT_PUBLIC_SITE_URL'
  | 'NEXT_PUBLIC_VERCEL_ENV'
  | 'NEXT_PUBLIC_VERCEL_BRANCH_URL'
  | 'NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL'
>

const LOCAL_ORIGIN = 'http://localhost:3000'

// The origin this deployment is served from, for auth links (email confirmation, OAuth,
// password reset) and same-origin checks. Each Vercel preview has its own URL, so one fixed
// NEXT_PUBLIC_SITE_URL cannot cover previews: an explicit value wins, otherwise Vercel's
// system variables decide. SEO canonicals deliberately do not use this (core/seo/site-url).
export function resolveAppOrigin(env: OriginEnv): string {
  if (env.NEXT_PUBLIC_SITE_URL) return new URL(env.NEXT_PUBLIC_SITE_URL).origin
  const host =
    env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
      ? env.NEXT_PUBLIC_VERCEL_BRANCH_URL
      : env.NEXT_PUBLIC_VERCEL_ENV === 'production'
        ? env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
        : undefined
  return host ? new URL(`https://${host}`).origin : LOCAL_ORIGIN
}

export const appOrigin: string = resolveAppOrigin(publicEnv)
