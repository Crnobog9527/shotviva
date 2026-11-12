/**
 * The weekly live SEO / GEO check for weeks 1–4 after indexing opened (SEO launch handbook 03):
 *
 *   pnpm seo:weekly https://shotviva.com
 *
 * Prints a Markdown report and exits 1 if anything is wrong:
 * - robots.txt, the sitemap index and llms.txt, as `pnpm seo:check --expect=open`;
 * - every child sitemap answers 200 and lists URLs; every URL in them: 200 at its own address,
 *   no noindex, canonical to itself; on GEO pages 5+ quotable facts and JSON-LD offers whose
 *   prices the page shows;
 * - app pages and the Chinese pages outside site.indexing.zhIndexablePaths: noindex, not in the
 *   sitemap;
 * - the home page with Googlebot, Bingbot and each AI crawler's user agent: 200, not a 403.
 * Every request has a timeout; a failed request is a problem line, never a crashed report.
 * What needs a Google or Bing sign-in is in the internal SEO runbook (private docs), not here.
 * No secrets, read-only, about 45 requests.
 */
import { CHECKED_PATHS, evaluate, type Fetched, type Snapshot } from './seo-check-lib'
import {
  APP_PATHS,
  checkChildSitemap,
  checkIndexable,
  checkNoindex,
  checkNotInSitemap,
  CRAWLER_AGENTS,
  sitemapLocs,
  ZH_NOINDEX_PATHS,
  type Page,
} from './seo-weekly-lib'

const USER_AGENT = 'shotviva-seo-weekly/1.0 (+https://github.com/Crnobog9527/shotviva)'
const TIMEOUT_MS = 20_000

// Never throws: a timeout or network error comes back as status 0 with `error` set.
async function get(url: string, userAgent = USER_AGENT): Promise<Page> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return { url, finalUrl: response.url, status: response.status, xRobotsTag: response.headers.get('x-robots-tag'), body: await response.text() }
  } catch (error) {
    const message = error instanceof Error ? (error.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000} s` : error.message) : String(error)
    return { url, finalUrl: url, status: 0, xRobotsTag: null, body: '', error: message }
  }
}

const asFetched = (page: Page): Fetched => ({ status: page.status, xRobotsTag: page.xRobotsTag, body: page.body })
const bullets = (problems: string[], ok: string) => (problems.length ? problems.map((p) => `- ✗ ${p}`).join('\n') : `- ✓ ${ok}`)

async function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'))
  if (!arg) throw new Error('Usage: pnpm seo:weekly <url>')
  const origin = new URL(arg).origin
  const lines: string[] = [`# SEO weekly check: ${origin} (${new Date().toISOString().slice(0, 10)})`, '']
  const problems: string[] = []

  // 1. The launch switch, exactly as the daily seo:check sees it.
  const base = await Promise.all(Object.entries(CHECKED_PATHS).map(async ([key, path]) => [key, await get(new URL(path, origin).href)] as const))
  const failed = base.filter(([, page]) => page.error).map(([, page]) => `${page.url} request failed: ${page.error}`)
  const snapshot = Object.fromEntries(base.map(([key, page]) => [key, asFetched(page)])) as Snapshot
  const switchProblems = [...failed, ...evaluate(snapshot, 'open')]
  problems.push(...switchProblems)
  lines.push('## Indexing switch, robots.txt, sitemap, llms.txt', bullets(switchProblems, 'open as expected'), '')

  // 2. Every child sitemap, then every URL in them.
  const children = sitemapLocs(snapshot.sitemap.body)
  const childXml = await Promise.all(children.map((url) => get(url)))
  const childProblems = [
    ...(children.length === 0 ? ['/sitemap.xml lists no child sitemaps'] : []),
    ...childXml.map(checkChildSitemap).filter((p): p is string => p !== null),
  ]
  problems.push(...childProblems)
  const locs = childXml.flatMap((child) => (child.status === 200 ? sitemapLocs(child.body) : []))
  lines.push(`## Sitemaps (${children.length} listed, ${locs.length} URLs)`, bullets(childProblems, `${children.map((url) => new URL(url).pathname).join(', ')}: 200, every one lists URLs`), '')
  const pages = await Promise.all(locs.map((url) => get(url)))
  lines.push('| URL | status | facts | offers | problems |', '|---|---|---|---|---|')
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
  lines.push('## App and noindex pages', bullets(appProblems, `${app.length} pages noindex (or 404 / 405), none in the sitemap`), '')

  // 4. Crawlers can fetch the home page (no firewall 403).
  lines.push(
    '## Crawler access to /',
    '_Spoofed user agents from this machine, not the real crawlers. If Vercel bot protection is ever switched on, a 403 here can be a false alarm: check the real crawlers in Search Console / Bing first._',
  )
  for (const [name, agent] of Object.entries(CRAWLER_AGENTS)) {
    const page = await get(`${origin}/`, agent)
    const ok = page.status === 200
    if (!ok) problems.push(`${name} got ${page.error ? `an error (${page.error})` : page.status} on /`)
    lines.push(`- ${ok ? '✓' : '✗'} ${name}: ${page.error ?? page.status}`)
  }
  lines.push(
    '',
    `**${problems.length === 0 ? 'All automated checks passed.' : `${problems.length} problem(s).`}**`,
    '',
    'Index coverage, `site:` counts and the AI-answer checks need the Owner\'s sign-ins: see the internal SEO runbook.',
  )

  process.stdout.write(`${lines.join('\n')}\n`)
  if (problems.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
