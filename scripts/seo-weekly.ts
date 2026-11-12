/**
 * The weekly live SEO / GEO check for weeks 1–4 after indexing opened (SEO launch handbook 03):
 *
 *   pnpm seo:weekly https://shotviva.com
 *
 * Prints a Markdown report and exits 1 if anything is wrong:
 * - robots.txt, the sitemap index and llms.txt, as `pnpm seo:check --expect=open`;
 * - every sitemap URL: 200 at its own address, no noindex, canonical to itself; on GEO pages
 *   5+ quotable facts and JSON-LD offers whose prices the page shows;
 * - app pages and the noindex Chinese inner pages: noindex, and not in the sitemap;
 * - the home page with Googlebot, Bingbot and each AI crawler's user agent: 200, not a 403.
 * What needs a Google or Bing login (index coverage, `site:` counts) is printed as a checklist
 * at the end: the URL Inspection API needs an OAuth client this repo does not have.
 * No secrets, read-only, about 25 requests.
 */
import { CHECKED_PATHS, evaluate, type Fetched, type Snapshot } from './seo-check-lib'
import {
  APP_PATHS,
  checkIndexable,
  checkNoindex,
  checkNotInSitemap,
  CRAWLER_AGENTS,
  sitemapLocs,
  ZH_NOINDEX_PATHS,
  type Page,
} from './seo-weekly-lib'

const USER_AGENT = 'shotviva-seo-weekly/1.0 (+https://github.com/Crnobog9527/shotviva)'

async function get(url: string, userAgent = USER_AGENT): Promise<Page> {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': userAgent } })
  return { url, finalUrl: response.url, status: response.status, xRobotsTag: response.headers.get('x-robots-tag'), body: await response.text() }
}

const asFetched = (page: Page): Fetched => ({ status: page.status, xRobotsTag: page.xRobotsTag, body: page.body })

const MANUAL = `
## Manual checks (need the Owner's Google / Bing sign-in)

1. Google: search \`site:shotviva.com\` (and \`site:shotviva.com/zh\`); note the result count. GSC's numbers lag; this is the quick signal.
2. Google Search Console, sc-domain:shotviva.com → Indexing → Pages: for each sitemap URL above, note "Indexed",
   "Discovered – currently not indexed" or "Crawled – currently not indexed". Use URL Inspection on any not indexed yet;
   request indexing only for the home page and at most a few pages a day.
   **If any page shows Discovered/Crawled – currently not indexed: stop adding pages and report to 总控.**
3. Google Search Console → Sitemaps: /sitemap.xml status "Success", discovered URL count = the sitemap total above.
4. Bing Webmaster Tools (shotviva.com only): Sitemaps "Success"; URL Inspection on the home page.
5. GEO: ask ChatGPT (search on), Perplexity and Gemini the same 5 questions; note whether Shotviva is named and which URL is cited:
   - "what is Shotviva"
   - "best image to image AI that keeps the product the same"
   - "AI tool to turn a phone photo into a white background product photo"
   - "AI restaurant menu photos from my own food photos"
   - "image to image generator without writing prompts"
6. Analytics: visits referred by chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com this week.
`

async function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'))
  if (!arg) throw new Error('Usage: pnpm seo:weekly <url>')
  const origin = new URL(arg).origin
  const lines: string[] = [`# SEO weekly check: ${origin} (${new Date().toISOString().slice(0, 10)})`, '']
  const problems: string[] = []

  // 1. The launch switch, exactly as the daily seo:check sees it.
  const base = await Promise.all(Object.entries(CHECKED_PATHS).map(async ([key, path]) => [key, asFetched(await get(new URL(path, origin).href))] as const))
  const snapshot = Object.fromEntries(base) as Snapshot
  const switchProblems = evaluate(snapshot, 'open')
  problems.push(...switchProblems)
  lines.push('## Indexing switch, robots.txt, sitemap, llms.txt', switchProblems.length ? switchProblems.map((p) => `- ✗ ${p}`).join('\n') : '- ✓ open as expected', '')

  // 2. Every URL in every child sitemap.
  const children = sitemapLocs(snapshot.sitemap.body)
  const childXml = await Promise.all(children.map((url) => get(url)))
  const locs = childXml.flatMap((child) => sitemapLocs(child.body))
  const pages = await Promise.all(locs.map((url) => get(url)))
  lines.push(`## Sitemap URLs (${locs.length} in ${children.length} sitemaps)`, '', '| URL | status | facts | offers | problems |', '|---|---|---|---|---|')
  for (const page of pages) {
    const report = checkIndexable(page)
    problems.push(...report.problems.map((p) => `${report.url}: ${p}`))
    lines.push(`| ${report.url} | ${page.status} | ${report.facts} | ${report.offers} | ${report.problems.join('; ') || '✓'} |`)
  }
  lines.push('')

  // 3. Pages that must stay out of the index.
  const app = await Promise.all([...APP_PATHS, ...ZH_NOINDEX_PATHS].map((path) => get(`${origin}${path}`)))
  const appProblems = [...app.map(checkNoindex).filter((p): p is string => p !== null), ...checkNotInSitemap(locs, origin)]
  problems.push(...appProblems)
  lines.push('## App and noindex pages', appProblems.length ? appProblems.map((p) => `- ✗ ${p}`).join('\n') : `- ✓ ${app.length} pages noindex or 404, none in the sitemap`, '')

  // 4. Crawlers can actually fetch the home page (no firewall 403).
  lines.push('## Crawler access to /')
  for (const [name, agent] of Object.entries(CRAWLER_AGENTS)) {
    const page = await get(`${origin}/`, agent)
    const ok = page.status === 200
    if (!ok) problems.push(`${name} got ${page.status} on /`)
    lines.push(`- ${ok ? '✓' : '✗'} ${name}: ${page.status}`)
  }
  lines.push('', `**${problems.length === 0 ? 'All automated checks passed.' : `${problems.length} problem(s).`}**`, MANUAL)

  process.stdout.write(`${lines.join('\n')}\n`)
  if (problems.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
