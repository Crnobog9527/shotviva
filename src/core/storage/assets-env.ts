import { z } from 'zod'

// Template covers on the site's own origin (ARCHITECTURE §8.3「公开读」, T51). shotviva.com's DNS
// is on Vercel, so the public bucket cannot take a custom domain: https://shotviva.com/assets/…
// is a Next rewrite to the bucket's r2.dev origin (R2_PUBLIC_ORIGIN, read at build), cached for
// a year by Vercel's CDN (cover file names carry a content hash). Pure config: next.config.ts
// imports it, and core/env.ts merges the schema. Moving the DNS to Cloudflare later only changes
// the two variables.

export const ASSETS_PATH = '/assets'
export const ASSETS_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const blankAsUnset = (value: unknown) => (value === '' ? undefined : value)
const noTrailingSlash = (url: string) => url.replace(/\/+$/, '')

export const assetsEnvShape = {
  // The public bucket's origin, e.g. https://pub-….r2.dev, no trailing slash. Server only.
  R2_PUBLIC_ORIGIN: z.preprocess(blankAsUnset, z.url({ protocol: /^https$/ }).transform(noTrailingSlash).optional()),
  NEXT_PUBLIC_ASSETS_BASE_URL: z.preprocess(blankAsUnset, z.url().transform(noTrailingSlash).optional()),
}

// The cover base is "this site's /assets" when its path is /assets: the rewrite then has to
// exist, so R2_PUBLIC_ORIGIN is required. A base on r2.dev (preview) needs nothing.
export function servesAssetsOnSite(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false
  try {
    return noTrailingSlash(new URL(baseUrl).pathname) === ASSETS_PATH
  } catch {
    return false
  }
}

type AssetsEnv = { R2_PUBLIC_ORIGIN?: string; NEXT_PUBLIC_ASSETS_BASE_URL?: string }

export function checkAssetsEnv(env: AssetsEnv, ctx: z.RefinementCtx) {
  if (servesAssetsOnSite(env.NEXT_PUBLIC_ASSETS_BASE_URL) && !env.R2_PUBLIC_ORIGIN) {
    ctx.addIssue({ code: 'custom', path: ['R2_PUBLIC_ORIGIN'], message: 'required when NEXT_PUBLIC_ASSETS_BASE_URL is the site’s own /assets' })
  }
}

// For next.config.ts: never throws, so a build without the variables still succeeds (the
// rewrite is simply absent). An invalid origin is treated as unset.
export function readAssetsEnv(source: Record<string, string | undefined>): AssetsEnv {
  const parsed = z.object(assetsEnvShape).safeParse(source)
  return parsed.success ? parsed.data : {}
}

export function assetsRewrites(origin: string | undefined) {
  return origin ? [{ source: `${ASSETS_PATH}/:path*`, destination: `${origin}/:path*` }] : []
}

// Browsers get Cache-Control; Vercel's CDN reads CDN-Cache-Control. A rewrite to an external
// origin is only cached by Vercel when rewrite caching is on (off by default for projects made
// before 2026-04-06, docs: vercel.com/docs/routing/rewrites), so it is switched on explicitly.
export function assetsHeaders() {
  return [
    {
      source: `${ASSETS_PATH}/:path*`,
      headers: [
        { key: 'Cache-Control', value: ASSETS_CACHE_CONTROL },
        { key: 'CDN-Cache-Control', value: ASSETS_CACHE_CONTROL },
        { key: 'x-vercel-enable-rewrite-caching', value: '1' },
      ],
    },
  ]
}

// next/image fetches covers by their absolute URL (templates.cover_*_url = base + path), so the
// base's host and path must be allowed: the site's own /assets in production, r2.dev in preview.
export function assetsRemotePatterns(baseUrl: string | undefined) {
  if (!baseUrl) return []
  const url = new URL(baseUrl)
  const protocol = url.protocol === 'http:' ? ('http' as const) : ('https' as const)
  const path = noTrailingSlash(url.pathname)
  return [{ protocol, hostname: url.hostname, ...(url.port ? { port: url.port } : {}), pathname: `${path}/**` }]
}
