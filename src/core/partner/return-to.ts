import type { PartnerSiteConfig } from '../config'

// Allowlist checks for every URL the connector sends a user (or a fetch) to. Exact host match
// only: no subdomain wildcards, no ports, no credentials, https only (ARCHITECTURE §14.2/14.5).

const MAX_URL_LENGTH = 2048

export function allowlistedUrl(value: string | null | undefined, hosts: readonly string[]): URL | null {
  if (!value || value.length > MAX_URL_LENGTH) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  // URL lowercases the hostname; the config is compared the same way.
  return hosts.some((host) => host.toLowerCase() === url.hostname) ? url : null
}

// Graylum's state value is echoed back untouched; anything odd is refused rather than encoded.
const STATE = /^[\x21-\x7e]{8,512}$/

export type ConnectRequest = { state: string; callback: URL }

// GET /connect/graylum?state=…&return_to=… → where the code goes. return_to defaults to the
// first allowlisted host; when given it must be that host's exact callback path, so the code
// can never land on another Graylum page (which could leak it via Referer or a redirect).
export function parseConnectRequest(
  params: { state?: string | null; return_to?: string | null },
  config: Pick<PartnerSiteConfig, 'returnToHosts' | 'connectCallbackPath'>,
): ConnectRequest | null {
  if (!params.state || !STATE.test(params.state)) return null
  const fallback = config.returnToHosts[0] ? `https://${config.returnToHosts[0]}${config.connectCallbackPath}` : null
  const callback = allowlistedUrl(params.return_to || fallback, config.returnToHosts)
  if (!callback || callback.pathname !== config.connectCallbackPath) return null
  return { state: params.state, callback }
}

export function connectRedirectUrl(request: ConnectRequest, code: string): string {
  const target = new URL(request.callback)
  target.searchParams.set('code', code)
  target.searchParams.set('state', request.state)
  return target.toString()
}

// top_up_url of a 402 / GET account: Shotviva's pricing page, remembering where to go back.
export function topUpUrl(origin: string, returnTo?: string | null): string {
  const url = new URL('/pricing', origin)
  url.searchParams.set('from', 'graylum')
  if (returnTo) url.searchParams.set('return_to', returnTo)
  return url.toString()
}

const UTM = { utm_source: 'shotviva', utm_medium: 'partner', utm_campaign: 'top_up' } as const

// For T9's payment success page: `/pricing?from=graylum&return_to=…` → the URL to send the user
// back to (with utm), or null when the request did not come from Graylum or return_to is not
// allowlisted — then the normal success page is shown instead.
export function pricingReturnTarget(
  params: { from?: string | null; return_to?: string | null },
  config: Pick<PartnerSiteConfig, 'returnToHosts'>,
): string | null {
  if (params.from !== 'graylum') return null
  const url = allowlistedUrl(params.return_to, config.returnToHosts)
  if (!url) return null
  for (const [key, value] of Object.entries(UTM)) url.searchParams.set(key, value)
  return url.toString()
}
