import type { PublicEnv } from '../public-env-schema'

// Safe on prerendered pages and on the auth and hosted checkout redirects. Vercel already
// serves HSTS for the host; extending it to every subdomain needs a separate DNS/TLS audit.
const enforcedHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src-attr 'none'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]

function sources(directive: string, ...values: (string | undefined)[]): string {
  return [directive, ...new Set(values.filter(Boolean))].join(' ')
}

// Use origins only: a DSN can contain credentials and a path. Ignore non-HTTP(S) schemes.
function origin(value?: string): string | undefined {
  if (!value) return
  const url = new URL(value)
  if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin
}

// Inspect this candidate in DevTools on preview/local production builds. No reporting endpoint:
// violation reports can carry document URLs. Next's inline hydration scripts and library DOM
// sinks still need work before these script restrictions can be enforced without losing ISR.
function reportOnlyPolicy(env: PublicEnv): string {
  const staticCdn = origin(env.NEXT_PUBLIC_ASSET_CDN_URL)
  const captcha = env.NEXT_PUBLIC_HCAPTCHA_SITEKEY ? 'https://*.hcaptcha.com' : undefined
  const storage = 'https://*.r2.cloudflarestorage.com'
  return [
    "default-src 'self'",
    sources('script-src', "'self'", staticCdn && `${staticCdn}/_next/static/`, captcha, 'https://vercel.live'),
    // Next's inline CSS and component styles are intentional and separate from script trust.
    sources('style-src', "'self'", "'unsafe-inline'", staticCdn, captcha, 'https://vercel.live'),
    sources('font-src', "'self'", staticCdn, 'https://vercel.live', 'https://assets.vercel.com'),
    sources('img-src', "'self'", 'data:', 'blob:', origin(env.NEXT_PUBLIC_IMAGE_CDN_URL),
      origin(env.NEXT_PUBLIC_ASSETS_BASE_URL), storage, captcha, 'https://vercel.live', 'https://vercel.com'),
    sources('connect-src', "'self'", origin(env.NEXT_PUBLIC_SUPABASE_URL), origin(env.NEXT_PUBLIC_SENTRY_DSN),
      storage, captcha, 'https://vercel.live', 'wss://ws-us3.pusher.com'),
    sources('media-src', "'self'", 'blob:', origin(env.NEXT_PUBLIC_ASSETS_BASE_URL), storage),
    sources('frame-src', 'https://vercel.live', captcha),
    "worker-src 'self' blob:",
    // OAuth and checkout navigate the top-level window. Test POST redirects across browsers
    // before adding form-action; browsers can apply that directive to the redirect target too.
    "require-trusted-types-for 'script'",
  ].join('; ')
}

export function securityHeaderRules(env: PublicEnv, observeScriptPolicy: boolean) {
  const rules = [{ source: '/:path*', headers: enforcedHeaders }]
  if (observeScriptPolicy) {
    rules.push({
      source: '/((?!_next/|api/|assets/|ingest/|fonts/|home/|cases/|brand/).*)',
      headers: [{ key: 'Content-Security-Policy-Report-Only', value: reportOnlyPolicy(env) }],
    })
  }
  return rules
}
