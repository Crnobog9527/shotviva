import { z } from 'zod'

import { at, bothPeriods, currentPeriod } from '../analytics/hogql'
import { rowsOf, type HogQL, type RunQuery } from '../analytics/posthog-query'
import type { Window } from '../analytics/range'
import { AUTOMATED, NAMED_BOT, publicEvent } from '../analytics/traffic-scope'
import { count, label } from '../analytics/values'
import { inIds } from './people'
import { AD_SOURCES, ALL_SOURCE_KEYS, hostPattern, PAID_MEDIUM, SOURCE_TABLE, tagPattern } from './source-table'

// Where people come from (ARCHITECTURE §16.2b). Read from the page view itself: its PAGE_URL (promoter
// ?ref=, ad click ids, utm_*) and its referrer. Anonymous visitors have no person properties in
// this project (person_profiles: identified_only), so $initial_* cannot be used. Each page view
// gets one source key from source-table.ts ('search:google', 'ai:chatgpt', 'direct', …).
// Visitors are counted by their first page view in the period; people who signed up or paid by
// the first page view PostHog has for them (up to 90 days back).

// Coming back from our own pages, sign-in or a checkout page is not where someone came from.
const RETURNS = `'^([a-z0-9-]+[.])*(shotviva[.]com|accounts[.]google[.]com|appleid[.]apple[.]com|checkout[.]stripe[.]com|pay[.]stripe[.]com|[a-z0-9-]*[.]?waffo[.][a-z.]+)$'`
const SLUG = /^[a-z0-9-]{3,24}$/

export type KeyMode = {
  // Real promoter slugs (affiliates.slug). Only a ?ref= carrying one of them is a promoter link.
  promoters: readonly string[]
  // Visitors: a real promoter link counts as 推广员. Sign-ups and buyers: never from PostHog,
  // only from the database binding, so their promoter links fall through to the referrer.
  creditPromoters: boolean
}

const PAGE_URL = "coalesce(toString(properties.$current_url), '')"
const SRC = "lower(coalesce(toString(properties.utm_source), ''))"
const MEDIUM = "lower(coalesce(toString(properties.utm_medium), ''))"
const DOMAIN = "lower(coalesce(toString(properties.$referring_domain), ''))"
const param = (name: string) => `notEmpty(extractURLParameter(${PAGE_URL}, '${name}'))`

function adBranches(): string[] {
  const paid = `match(${MEDIUM}, '${PAID_MEDIUM}')`
  return AD_SOURCES.map((ad) => {
    const clicks = ad.clickIds.map(param)
    const tagged = ad.tags.length ? [`(${paid} AND match(${SRC}, ${tagPattern(ad.tags)}))`] : []
    const cond = ad.key === 'ads:other' ? paid : [...clicks, ...tagged].join(' OR ')
    return `${cond}, '${ad.key}'`
  })
}

// The source key of one event, from its own properties. Order: a real promoter link (visitors
// only), a paid click, utm_source, a recognisable ?ref= value (producthunt, chatgpt…), the
// referrer host; an unrecognised utm or ?ref= is 其他网站; nothing at all is 直接访问.
export function sourceKey(mode: KeyMode): string {
  const slugs = mode.promoters.filter((slug) => SLUG.test(slug)).map((slug) => `'${slug}'`)
  const raw = `lower(extractURLParameter(${PAGE_URL}, 'ref'))`
  const isPromoter = slugs.length ? `${raw} IN (${slugs.join(', ')})` : 'false'
  // A promoter slug is not a tag: without the database binding it says nothing about the source.
  const ref = `if(${isPromoter}, '', ${raw})`
  const tagged = SOURCE_TABLE.filter((def) => def.tags?.length)
  const hosted = SOURCE_TABLE.filter((def) => def.hosts?.length)
  const branches = [
    `${mode.creditPromoters ? isPromoter : 'false'}, 'affiliate'`,
    ...adBranches(),
    ...tagged.map((def) => `match(${SRC}, ${tagPattern(def.tags!)}), '${def.key}'`),
    `${SRC} != '', 'other'`,
    ...tagged.map((def) => `match(${ref}, ${tagPattern(def.tags!)}), '${def.key}'`),
    ...hosted.map((def) => `match(${DOMAIN}, ${hostPattern(def)}), '${def.key}'`),
    `${ref} != '', 'other'`,
    `${DOMAIN} IN ('', '$direct') OR match(${DOMAIN}, ${RETURNS}), 'direct'`,
  ]
  return `multiIf(\n    ${branches.join(',\n    ')},\n    'other')`
}

const notBot = `NOT ((${NAMED_BOT}) OR ${AUTOMATED})`

// Visitors per source key, each by their first public page view in the current period (admins
// and automation left out, like 「访客」).
export function visitorsBySourceQuery(window: Window, adminIds: readonly string[], promoters: readonly string[]): HogQL {
  const internal = adminIds.length
    ? `person_id NOT IN (SELECT person_id FROM events WHERE ${inIds('distinct_id', adminIds)} AND ${bothPeriods(window)})`
    : 'true'
  return {
    name: 'growth.sources.visitors',
    query: `
SELECT source, count() AS visitors
FROM (
  SELECT person_id, argMin(${sourceKey({ promoters, creditPromoters: true })}, timestamp) AS source
  FROM events
  WHERE event = '$pageview' AND ${publicEvent} AND ${currentPeriod(window)} AND ${notBot} AND ${internal}
  GROUP BY person_id
)
GROUP BY source LIMIT 200`,
  }
}

const LOOKBACK_DAYS = 90
export const FIRST_TOUCH_LIMIT = 10_000

// For each user id: the source of the first public page view of the PostHog person they are
// (anonymous views before sign-in included, which PostHog merged into them). Empty when none.
export function firstTouchQuery(window: Window, userIds: readonly string[], promoters: readonly string[]): HogQL {
  const since = at(new Date(Date.parse(window.start) - LOOKBACK_DAYS * 86_400_000).toISOString())
  const until = at(window.end)
  return {
    name: 'growth.sources.first_touch',
    query: `
SELECT user_id, source
FROM (
  SELECT person_id, argMinIf(${sourceKey({ promoters, creditPromoters: false })}, timestamp, event = '$pageview' AND ${publicEvent}) AS source,
    groupUniqArrayIf(distinct_id, ${inIds('distinct_id', userIds)}) AS users
  FROM events
  WHERE timestamp >= ${since} AND timestamp < ${until}
    AND person_id IN (SELECT person_id FROM events WHERE ${inIds('distinct_id', userIds)} AND timestamp >= ${since} AND timestamp < ${until})
  GROUP BY person_id
)
ARRAY JOIN users AS user_id
LIMIT ${FIRST_TOUCH_LIMIT}`,
  }
}

const KNOWN = new Set(ALL_SOURCE_KEYS)
const visitorRow = z.object({ source: label, visitors: count })
const touchRow = z.object({ user_id: label, source: label })

// Plain objects (not Maps) so they survive the 'use cache' round trip.
export type VisitorsBySource = Record<string, number>
export type FirstTouch = Record<string, string>

// A key this code does not know (an older deploy's label) is folded into 其他网站.
export function shapeVisitors(rows: z.infer<typeof visitorRow>[]): VisitorsBySource {
  const result: VisitorsBySource = Object.fromEntries(ALL_SOURCE_KEYS.map((key) => [key, 0]))
  for (const row of rows) {
    const key = KNOWN.has(row.source) ? row.source : 'other'
    result[key] = (result[key] ?? 0) + row.visitors
  }
  return result
}

// A person with no public page view in range has an empty source: they are left out of the map.
export function shapeFirstTouch(rows: z.infer<typeof touchRow>[]): FirstTouch {
  const map: FirstTouch = {}
  for (const row of rows) {
    if (row.source !== '') map[row.user_id] = KNOWN.has(row.source) ? row.source : 'other'
  }
  return map
}

// truncated: the first-touch read hit its row limit, so some people may show as 认不出来.
export type SourceReads = { visitors: VisitorsBySource; firstTouch: FirstTouch; truncated: boolean }
export type SourceInput = { adminIds: readonly string[]; userIds: readonly string[]; promoters: readonly string[] }

export async function loadSources(run: RunQuery, window: Window, input: SourceInput): Promise<SourceReads> {
  const visitors = shapeVisitors(rowsOf(await run(visitorsBySourceQuery(window, input.adminIds, input.promoters)), visitorRow))
  if (!input.userIds.length) return { visitors, firstTouch: {}, truncated: false }
  const rows = rowsOf(await run(firstTouchQuery(window, input.userIds, input.promoters)), touchRow)
  return { visitors, firstTouch: shapeFirstTouch(rows), truncated: rows.length >= FIRST_TOUCH_LIMIT }
}
