import { isQuotableFact, MIN_QUOTABLE_FACTS } from '../src/site/content/geo-facts'

// The pure half of `pnpm seo:weekly` (SEO launch handbook 03, weeks 1–4 after indexing opened):
// given what the live site served, check every sitemap URL and the app pages. No network here,
// so it is unit-tested; scripts/seo-weekly.ts fetches and prints the report.

export type Page = { url: string; finalUrl: string; status: number; xRobotsTag: string | null; body: string }

export type PageReport = {
  url: string
  problems: string[]
  facts: number
  offers: number
}

// Pages that must stay out of the index (ARCHITECTURE §17: every app page is noindex).
export const APP_PATHS = ['/login', '/signup', '/generate', '/photos', '/account', '/checkout', '/wishlist', '/zh/login', '/zh/generate']

// Chinese inner pages that exist but are noindex (site.indexing.zhIndexablePaths has only 3).
export const ZH_NOINDEX_PATHS = ['/zh/commercial-photography', '/zh/ai-restaurant-menu']

// Fetched with each user agent: a firewall or bot rule that 403s one of them makes robots.txt moot.
export const CRAWLER_AGENTS: Record<string, string> = {
  Googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  Bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  'ChatGPT-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
}

// Legal pages are indexable but are not GEO pages: no fact or offer checks there.
const LEGAL = /\/(terms|privacy|refund-policy|acceptable-use)$/

export const sitemapLocs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1] ?? '')

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1] ?? null

export function metaRobots(html: string): string | null {
  const tag = html.match(/<meta[^>]+name="robots"[^>]*>/i)?.[0]
  return tag ? attr(tag, 'content') : null
}

export function canonical(html: string): string | null {
  const tag = html.match(/<link[^>]+rel="canonical"[^>]*>/i)?.[0]
  return tag ? attr(tag, 'href') : null
}

const decode = (text: string) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')

// The text a visitor reads: scripts, styles and tags dropped; block tags start a new line.
export function visibleText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/?(h[1-6]|p|li|div|section|article|br|td|th|dt|dd|summary|button|a)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}

export function jsonLd(html: string): unknown[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  return blocks.flatMap((m) => {
    try {
      const data: unknown = JSON.parse(m[1] ?? '')
      return Array.isArray(data) ? data : [data]
    } catch {
      return []
    }
  })
}

type Offer = { name?: string; price?: string; description?: string }

function offersIn(ld: unknown[]): Offer[] {
  return ld.flatMap((item) => {
    const node = item as { '@type'?: string; offers?: Offer[] }
    return node['@type'] === 'SoftwareApplication' && Array.isArray(node.offers) ? node.offers : []
  })
}

// "$19.90", "$99": the way the pages print a price.
const usd = (price: string) => {
  const n = Number(price)
  return Number.isInteger(n) ? `$${n.toLocaleString('en-US')}` : `$${n.toFixed(2)}`
}

export function quotableFactsIn(text: string): string[] {
  const found = new Set<string>()
  for (const line of text.split('\n')) {
    for (const sentence of line.split(/(?<=[.!?])\s+(?=[A-Z“"(])|(?<=[。！？])/)) {
      const trimmed = sentence.trim()
      if (isQuotableFact(trimmed)) found.add(trimmed)
    }
  }
  return [...found]
}

const noindexed = (page: Page) => /noindex/i.test(page.xRobotsTag ?? '') || /noindex/i.test(metaRobots(page.body) ?? '')
const strip = (url: string) => url.replace(/\/$/, '')

// One sitemap URL: answers 200 at that address, indexable, canonical to itself; a GEO page also
// carries five quotable facts and JSON-LD offers whose prices it shows (03-S2, 03-S3).
export function checkIndexable(page: Page): PageReport {
  const problems: string[] = []
  if (page.status !== 200) problems.push(`answered ${page.status}`)
  if (strip(page.finalUrl) !== strip(page.url)) problems.push(`redirects to ${page.finalUrl}`)
  if (noindexed(page)) problems.push('noindex (meta or X-Robots-Tag)')
  const canon = canonical(page.body)
  if (!canon) problems.push('no canonical')
  else if (strip(canon) !== strip(page.url)) problems.push(`canonical is ${canon}`)
  const text = visibleText(page.body)
  const offers = offersIn(jsonLd(page.body))
  const facts = quotableFactsIn(text).length
  if (!LEGAL.test(strip(page.url))) {
    if (facts < MIN_QUOTABLE_FACTS) problems.push(`${facts} quotable facts, want ${MIN_QUOTABLE_FACTS}+`)
    for (const offer of offers) {
      if (offer.price && Number(offer.price) > 0 && !text.includes(usd(offer.price))) {
        problems.push(`JSON-LD offer "${offer.name}" ${usd(offer.price)} is not in the page text`)
      }
    }
  }
  return { url: page.url, problems, facts, offers: offers.length }
}

// An app page must be noindex; one that redirects (to sign-in) is checked where it lands.
// A 404 is fine: the feature is switched off.
export function checkNoindex(page: Page): string | null {
  if (page.status === 404) return null
  if (page.status !== 200) return `${page.url} answered ${page.status}`
  return noindexed(page) ? null : `${page.url} is indexable (landed on ${page.finalUrl})`
}

export function checkNotInSitemap(locs: readonly string[], origin: string): string[] {
  const listed = new Set(locs.map((loc) => strip(new URL(loc).pathname) || '/'))
  return [...APP_PATHS, ...ZH_NOINDEX_PATHS, '/gallery'].filter((path) => listed.has(path)).map((path) => `${origin}${path} is in the sitemap`)
}
