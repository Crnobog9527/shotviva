// The canonical production host redirects www to the apex. Preview shares the PostHog project.
const host = (expr: string) => `lower(coalesce(toString(${expr}), ''))`
export const EVENT_HOST = "coalesce(nullIf(properties.$host, ''), domain(properties.$current_url))"
export const EVENT_PATH = 'properties.$pathname'

export function scopeOf(hostExpr: string, path: string): string {
  return `multiIf(${host(hostExpr)} = '', 'missing', ${host(hostExpr)} != 'shotviva.com', 'nonPublicHost',
    NOT startsWith(coalesce(toString(${path}), ''), '/'), 'missing',
    match(${path}, '^/(zh/)?admin(/|$)'), 'admin',
    match(${path}, '^/(zh/)?generate/upload-test(/|$)'), 'test', 'public')`
}

export const publicEvent = `${scopeOf(EVENT_HOST, EVENT_PATH)} = 'public'`
export const publicEntry = (prefix = '') => `${scopeOf(`domain(${prefix}$entry_current_url)`, `${prefix}$entry_pathname`)} = 'public'`

// Historical server conversions did not carry a host. Only attach them to people with a
// public pageview in the same period. Other browser events must themselves be public.
export const publicJourney = `(${publicEvent} OR properties.$lib = 'shotviva-server' AND event IN ('signup','generate','checkout_start','purchase'))`

// A page view's self-reported tool name (never network-verified) or automation traits. Shared by
// the traffic block and the overview's visitor count, which leaves both out of 「访客」.
const VIEW_UA = "lower(coalesce(nullIf(properties.$raw_user_agent,''), properties.$useragent,''))"
export const NAMED_BOT = `match(${VIEW_UA}, 'googlebot|bingbot|gptbot|oai-searchbot|chatgpt-user|claudebot|applebot|baiduspider|duckduckbot|yandexbot')`
export const AUTOMATED = `(match(${VIEW_UA}, 'headless|playwright|puppeteer|crawler|spider|bot[/ ;)]|lighthouse')
      OR match(lower(coalesce(properties.$browser,'')), 'headless|bot|crawler'))`
