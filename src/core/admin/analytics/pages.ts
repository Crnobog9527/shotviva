import { z } from 'zod'

import { bothPeriods, currentPeriod, pagePath, periodColumn } from './hogql'
import { rowsOf, type HogQL, type RunQuery } from './posthog-query'
import type { Window } from './range'
import { count, label, maybe, rate } from './values'

// Block 1 「每页表现」 (ARCHITECTURE §16.2a): per page, views and visitors (with the period before),
// average time on page and deepest scroll (from the $prev_pageview_* properties posthog-js puts on
// the next $pageview or the $pageleave), bounce rate of visits that started there (sessions
// table), and how many people whose first page was this one signed up or paid.

// A tab left open overnight is not reading time: one page view counts at most 30 minutes.
export const MAX_SECONDS = 1800
const LIMIT = 50

export function pageViewsQuery(window: Window): HogQL {
  const cur = periodColumn(window)
  return {
    name: 'pages.views',
    query: `
SELECT path,
  countIf(is_view AND cur) AS views, countIf(is_view AND NOT cur) AS views_prev,
  uniqIf(person_id, is_view AND cur) AS visitors, uniqIf(person_id, is_view AND NOT cur) AS visitors_prev,
  avgIf(seconds, NOT is_view AND cur) AS avg_seconds, avgIf(scroll, NOT is_view AND cur) AS avg_scroll
FROM (
  SELECT ${pagePath('properties.$pathname')} AS path, 1 AS is_view, ${cur} AS cur, person_id, NULL AS seconds, NULL AS scroll
  FROM events WHERE event = '$pageview' AND ${bothPeriods(window)}
  UNION ALL
  SELECT ${pagePath('properties.$prev_pageview_pathname')} AS path, 0 AS is_view, ${cur} AS cur, person_id,
    least(toFloat(properties.$prev_pageview_duration), ${MAX_SECONDS}) AS seconds,
    toFloat(properties.$prev_pageview_max_scroll_percentage) AS scroll
  FROM events WHERE event IN ('$pageview', '$pageleave') AND properties.$prev_pageview_duration IS NOT NULL AND ${bothPeriods(window)}
)
WHERE path != ''
GROUP BY path ORDER BY views DESC LIMIT ${LIMIT}`,
  }
}

export function bounceQuery(window: Window): HogQL {
  return {
    name: 'pages.bounce',
    query: `
SELECT ${pagePath('$entry_pathname')} AS path, count() AS sessions, countIf($is_bounce) AS bounces
FROM sessions WHERE ${currentPeriod(window, '$start_timestamp')}
GROUP BY path ORDER BY sessions DESC LIMIT ${LIMIT}`,
  }
}

// Per person, the first page of the period, and whether they signed up / paid in it.
export function landingQuery(window: Window): HogQL {
  return {
    name: 'pages.landing',
    query: `
SELECT entry AS path, count() AS people, countIf(signed) AS signups, countIf(paid) AS buyers
FROM (
  SELECT person_id, argMinIf(${pagePath('properties.$pathname')}, timestamp, event = '$pageview') AS entry,
    countIf(event = 'signup') > 0 AS signed, countIf(event = 'purchase') > 0 AS paid
  FROM events WHERE event IN ('$pageview', 'signup', 'purchase') AND ${currentPeriod(window)}
  GROUP BY person_id
)
WHERE entry != ''
GROUP BY path ORDER BY people DESC LIMIT ${LIMIT}`,
  }
}

const viewRow = z.object({
  path: label,
  views: count,
  views_prev: count,
  visitors: count,
  visitors_prev: count,
  avg_seconds: maybe,
  avg_scroll: maybe,
})
const bounceRow = z.object({ path: label, sessions: count, bounces: count })
const landingRow = z.object({ path: label, people: count, signups: count, buyers: count })

export type PageRow = {
  path: string
  views: number
  viewsPrev: number
  visitors: number
  visitorsPrev: number
  avgSeconds: number | null
  // 0..1
  avgScroll: number | null
  bounceRate: number | null
  landed: number
  signupRate: number | null
  purchaseRate: number | null
}

export const PAGE_SORTS = ['views', 'visitors', 'seconds', 'scroll', 'bounce', 'signup', 'purchase'] as const
export type PageSort = (typeof PAGE_SORTS)[number]

const SORT_VALUE: Record<PageSort, (row: PageRow) => number | null> = {
  views: (row) => row.views,
  visitors: (row) => row.visitors,
  seconds: (row) => row.avgSeconds,
  scroll: (row) => row.avgScroll,
  bounce: (row) => row.bounceRate,
  signup: (row) => row.signupRate,
  purchase: (row) => row.purchaseRate,
}

export function parsePageSort(value: unknown): PageSort {
  return typeof value === 'string' && (PAGE_SORTS as readonly string[]).includes(value) ? (value as PageSort) : 'views'
}

// Highest first; pages without the number go last.
export function sortPages(rows: readonly PageRow[], sort: PageSort): PageRow[] {
  const value = SORT_VALUE[sort]
  return [...rows].sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1) || b.views - a.views)
}

export function mergePages(views: z.infer<typeof viewRow>[], bounces: z.infer<typeof bounceRow>[], landings: z.infer<typeof landingRow>[]): PageRow[] {
  const bounceOf = new Map(bounces.map((row) => [row.path, row]))
  const landingOf = new Map(landings.map((row) => [row.path, row]))
  return views
    .filter((row) => row.views + row.views_prev > 0)
    .map((row) => {
      const bounce = bounceOf.get(row.path)
      const landing = landingOf.get(row.path)
      return {
        path: row.path,
        views: row.views,
        viewsPrev: row.views_prev,
        visitors: row.visitors,
        visitorsPrev: row.visitors_prev,
        avgSeconds: row.avg_seconds,
        avgScroll: row.avg_scroll,
        bounceRate: bounce ? rate(bounce.bounces, bounce.sessions) : null,
        landed: landing?.people ?? 0,
        signupRate: landing ? rate(landing.signups, landing.people) : null,
        purchaseRate: landing ? rate(landing.buyers, landing.people) : null,
      }
    })
}

// Three queries one after another: PostHog runs three per project at once, and the page has five
// other blocks asking at the same time.
export async function loadPages(run: RunQuery, window: Window): Promise<PageRow[]> {
  const views = rowsOf(await run(pageViewsQuery(window)), viewRow)
  const bounces = rowsOf(await run(bounceQuery(window)), bounceRow)
  const landings = rowsOf(await run(landingQuery(window)), landingRow)
  return mergePages(views, bounces, landings)
}
