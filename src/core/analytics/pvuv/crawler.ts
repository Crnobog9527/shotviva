import type { NextFetchEvent, NextRequest } from 'next/server'

// PVUV.ai crawler reporting (https://api.pvuv.ai/docs/crawler-sync.md). AI assistants and search
// engines fetch the HTML without running JavaScript, so the browser script never sees them; the
// proxy reports each page fetch by one of them to PVUV after the response has gone out. PVUV
// checks the address against the operator's published ranges (a fake user agent shows as fake).
//
// Never blocks and never fails a page: the send runs inside event.waitUntil, every error is
// swallowed, and with PVUV_SITE or PVUV_INGEST_TOKEN unset nothing is sent. It changes no
// response, header or cache rule.

// The crawler guide's list, verbatim.
export const CRAWLERS = /chatgpt-user|oai-searchbot|gptbot|perplexity-user|perplexitybot|claude-user|claude-searchbot|claudebot|bingbot|googlebot|applebot|duckduckbot|duckassistbot|yandexbot|meta-externalagent|bytespider/i
// Files (not pages): any extension except html, htm, txt, xml and md.
const ASSET = /\.(?!(?:html?|txt|xml|md)$)[a-z0-9]{1,8}$/i

const SEND_TIMEOUT_MS = 3_000

export type CrawlerHit = { ua: string; path: string; ip: string | undefined; ts: number }
export type PvuvServerEnv = { PVUV_SITE?: string | undefined; PVUV_INGEST_TOKEN?: string | undefined }
type Fetch = (input: string, init: RequestInit) => Promise<unknown>

const isPage = (path: string): boolean => !path.startsWith('/api/') && !path.startsWith('/_') && !ASSET.test(path)

function clientIp(headers: Headers): string | undefined {
  return (headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim()) || undefined
}

export function crawlerHitOf(request: Pick<NextRequest, 'method' | 'headers'> & { nextUrl: { pathname: string } }, now = Date.now()): CrawlerHit | null {
  const ua = request.headers.get('user-agent') ?? ''
  const path = request.nextUrl.pathname
  const fetchesPage = (request.method === 'GET' || request.method === 'HEAD') && CRAWLERS.test(ua) && isPage(path)
  return fetchesPage ? { ua, path, ip: clientIp(request.headers), ts: now } : null
}

export function reportCrawlerHit(
  request: NextRequest,
  event: Pick<NextFetchEvent, 'waitUntil'> | undefined,
  readEnv: () => PvuvServerEnv,
  doFetch: Fetch = fetch,
): void {
  try {
    if (!event) return
    // Most requests are not crawlers: the environment is read only for the ones that are.
    const hit = crawlerHitOf(request)
    if (!hit) return
    const env = readEnv()
    if (!env.PVUV_SITE || !env.PVUV_INGEST_TOKEN) return
    event.waitUntil(
      Promise.resolve()
        .then(() =>
          doFetch(`https://api.pvuv.ai/v1/sites/${env.PVUV_SITE}/crawler_hits`, {
            method: 'POST',
            headers: { authorization: `Bearer ${env.PVUV_INGEST_TOKEN}`, 'content-type': 'application/json' },
            body: JSON.stringify({ hits: [hit] }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          }),
        )
        .catch(() => {}),
    )
  } catch {
    // Reporting must never fail the page.
  }
}
