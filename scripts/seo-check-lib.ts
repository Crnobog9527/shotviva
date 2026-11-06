import { AI_CRAWLERS, PRELAUNCH_BLOCKED_CRAWLERS } from '../src/core/seo/crawlers'

// The pure half of `pnpm seo:check` (ARCHITECTURE §12.0): given what the live site served,
// list everything that does not match the expected state. No network here, so it is unit-tested.

export type Expectation = 'closed' | 'open'
export type Fetched = { status: number; xRobotsTag: string | null; body: string }
export type Snapshot = { home: Fetched; robots: Fetched; sitemap: Fetched; sitemapPages: Fetched; llms: Fetched }

export const CHECKED_PATHS = {
  home: '/',
  robots: '/robots.txt',
  sitemap: '/sitemap.xml',
  sitemapPages: '/sitemap-pages.xml',
  llms: '/llms.txt',
} as const satisfies Record<keyof Snapshot, string>

type Group = { agents: string[]; rules: string[] }

// robots.txt groups: consecutive User-agent lines share the rules that follow them.
export function robotsGroups(text: string): Group[] {
  const groups: Group[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim()
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    const current = groups.at(-1)
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) groups.push({ agents: [value.toLowerCase()], rules: [] })
      else current.agents.push(value.toLowerCase())
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.rules.push(`${key}:${value}`)
    }
  }
  return groups
}

const disallowsAll = (groups: Group[], agent: string) =>
  groups.some((group) => group.agents.includes(agent.toLowerCase()) && group.rules.includes('disallow:/'))

const hasLine = (text: string, key: string) => new RegExp(`^\\s*${key}\\s*:`, 'im').test(text)
const noindexHeader = (fetched: Fetched) => /noindex/i.test(fetched.xRobotsTag ?? '')

export function metaRobots(html: string): string | null {
  const tag = html.match(/<meta[^>]+name="robots"[^>]*>/i)?.[0]
  return tag?.match(/content="([^"]*)"/i)?.[1] ?? null
}

function closedProblems(s: Snapshot): string[] {
  const groups = robotsGroups(s.robots.body)
  return [
    !noindexHeader(s.home) && '/ has no X-Robots-Tag: noindex',
    !/noindex/i.test(metaRobots(s.home.body) ?? '') && '/ has no robots noindex meta',
    !noindexHeader(s.robots) && '/robots.txt has no X-Robots-Tag: noindex',
    hasLine(s.robots.body, 'sitemap') && 'robots.txt has a Sitemap line',
    hasLine(s.robots.body, 'host') && 'robots.txt has a Host line',
    disallowsAll(groups, '*') && 'robots.txt disallows * (Google and Bing must be able to see noindex)',
    ...PRELAUNCH_BLOCKED_CRAWLERS.filter((bot) => !disallowsAll(groups, bot)).map((bot) => `robots.txt does not disallow ${bot}`),
    ...(['sitemap', 'sitemapPages', 'llms'] as const)
      .filter((key) => s[key].status !== 404)
      .map((key) => `${CHECKED_PATHS[key]} answered ${s[key].status}, expected 404`),
  ].filter((problem): problem is string => typeof problem === 'string')
}

function openProblems(s: Snapshot): string[] {
  const groups = robotsGroups(s.robots.body)
  return [
    noindexHeader(s.home) && '/ still sends X-Robots-Tag: noindex',
    /noindex/i.test(metaRobots(s.home.body) ?? '') && '/ still has a robots noindex meta',
    !hasLine(s.robots.body, 'sitemap') && 'robots.txt has no Sitemap line',
    ...AI_CRAWLERS.filter((bot) => disallowsAll(groups, bot)).map((bot) => `robots.txt disallows ${bot}`),
    ...(['sitemap', 'sitemapPages', 'llms'] as const)
      .filter((key) => s[key].status !== 200)
      .map((key) => `${CHECKED_PATHS[key]} answered ${s[key].status}, expected 200`),
  ].filter((problem): problem is string => typeof problem === 'string')
}

export function evaluate(snapshot: Snapshot, expectation: Expectation): string[] {
  const unreachable = snapshot.home.status !== 200 ? [`/ answered ${snapshot.home.status}, expected 200`] : []
  return [...unreachable, ...(expectation === 'closed' ? closedProblems(snapshot) : openProblems(snapshot))]
}

export function parseArgs(argv: readonly string[]): { origin: string; expectation: Expectation } {
  const url = argv.find((arg) => !arg.startsWith('--'))
  const expectation = argv.find((arg) => arg.startsWith('--expect='))?.slice('--expect='.length)
  if (!url || (expectation !== 'closed' && expectation !== 'open')) {
    throw new Error('Usage: pnpm seo:check <url> --expect=closed|open')
  }
  return { origin: new URL(url).origin, expectation }
}
