export type CanonicalRedirectInput = {
  // The request's Host header.
  host: string | null
  vercelEnv: string | undefined
  // The deployment's configured origin (core/site-url appOrigin, from NEXT_PUBLIC_SITE_URL).
  appOrigin: string
  // site.brand.domain, e.g. 'shotviva.com'.
  canonicalHost: string
  // Production hosts that should land on the canonical domain, e.g. 'shotviva.vercel.app'.
  redirectHosts: readonly string[]
}

// Production's vercel.app address 308s to the real domain (ARCHITECTURE §12.0), but only once
// the deployment is actually configured for that domain (NEXT_PUBLIC_SITE_URL = https://
// shotviva.com): before the domain is bound, redirecting would send everyone to a dead host.
// Returns the redirect target, or null to serve the request as is.
export function canonicalHostRedirect(input: CanonicalRedirectInput, pathAndQuery: string): string | null {
  if (input.vercelEnv !== 'production' || !input.host) return null
  if (new URL(input.appOrigin).host !== input.canonicalHost) return null
  if (input.host === input.canonicalHost || !input.redirectHosts.includes(input.host)) return null
  return `https://${input.canonicalHost}${pathAndQuery}`
}
