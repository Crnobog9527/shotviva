import { z } from 'zod'

import { at } from '../analytics/hogql'
import { rowsOf, type HogQL, type RunQuery } from '../analytics/posthog-query'
import { AUTOMATED, NAMED_BOT, publicEvent } from '../analytics/traffic-scope'
import { count, label } from '../analytics/values'
import { inIds } from '../growth/people'
import { sourceColumns, sourceKey } from '../growth/sources'
import type { Bucket, Period } from './period'

// The PostHog half of the 「漏斗」 and 「模板」 tabs (ARCHITECTURE §16.2c). Visitors are counted the
// way the overview counts them (public shotviva.com pages, no crawlers, automation or admins);
// each visitor gets one language and one source from their first page view in the period. A
// share page (/t/<template>?s=…) is its own source. The person ids asked about are ours.

export const ALL_BUCKET = 'all'
const LOOKBACK_DAYS = 90
export const TOUCH_LIMIT = 10_000

const period = (p: Period, column = 'timestamp') => `${column} >= ${at(p.start)} AND ${column} < ${at(p.end)}`
const notBot = `NOT ((${NAMED_BOT}) OR ${AUTOMATED})`
// Read over the inner SELECT's columns (sourceColumns plus src_path), never `properties` itself.
const PATH_COLUMN = "coalesce(toString(properties.$pathname), '') AS src_path"
const SHARE_VIEW = "match(src_path, '^/(zh/)?t/[^/]+/?$') AND notEmpty(extractURLParameter(src_url, 's'))"
const ZH_VIEW = "if(match(src_path, '^/zh(/|$)'), 'zh', 'en')"
const source = (promoters: boolean) => `if(${SHARE_VIEW}, 'share', ${sourceKey({ creditPromoters: promoters })})`

function bucketExpr(bucket: Bucket): string {
  const local = "toTimeZone(e.timestamp, 'Asia/Shanghai')"
  return bucket === 'week' ? `toString(toMonday(${local}))` : `toString(toDate(${local}))`
}

// Unique visitors per bucket, language and source, plus the whole period as bucket 'all' (a
// person who came on three days is one visitor of the period, not three).
export function visitorsQuery(p: Period, bucket: Bucket, adminIds: readonly string[], promoters: readonly string[]): HogQL {
  const internal = adminIds.length
    ? `person_id NOT IN (SELECT person_id FROM events WHERE ${inIds('distinct_id', adminIds)} AND ${period(p)})`
    : 'true'
  const views = `event = '$pageview' AND ${publicEvent} AND ${period(p)} AND ${notBot} AND ${internal}`
  return {
    name: 'insights.visitors',
    query: `
SELECT b AS bucket, v.locale AS locale, v.source AS source, uniq(e.person_id) AS visitors
FROM (SELECT person_id, timestamp FROM events WHERE ${views}) AS e
INNER JOIN (
  SELECT person_id, argMin(${source(true)}, timestamp) AS source, argMin(${ZH_VIEW}, timestamp) AS locale
  FROM (SELECT person_id, timestamp, ${PATH_COLUMN}, ${sourceColumns(promoters)} FROM events WHERE ${views})
  GROUP BY person_id
) AS v ON e.person_id = v.person_id
ARRAY JOIN [${bucketExpr(bucket)}, '${ALL_BUCKET}'] AS b
GROUP BY bucket, locale, source
LIMIT 10000`,
  }
}

// For each signed-up user: the source and language of the first public page view PostHog has for
// their person (up to 90 days back), and whether their sign-up carried a share link.
export function touchesQuery(p: Period, userIds: readonly string[], promoters: readonly string[]): HogQL {
  const since = at(new Date(Date.parse(p.start) - LOOKBACK_DAYS * 86_400_000).toISOString())
  const until = at(p.end)
  const users = inIds('distinct_id', userIds)
  return {
    name: 'insights.touches',
    query: `
SELECT user_id, source, locale, shared, landing, ref_host, utm, medium
FROM (
  SELECT person_id,
    argMinIf(${source(false)}, timestamp, is_view) AS source,
    argMinIf(src_path, timestamp, is_view) AS landing,
    argMinIf(src_domain, timestamp, is_view) AS ref_host,
    argMinIf(src_utm, timestamp, is_view) AS utm,
    argMinIf(src_medium, timestamp, is_view) AS medium,
    argMinIf(${ZH_VIEW}, timestamp, is_view) AS locale,
    max(event = 'signup' AND share_mark) AS shared,
    groupUniqArrayIf(distinct_id, is_user) AS users
  FROM (
    SELECT person_id, distinct_id, timestamp, event, event = '$pageview' AND ${publicEvent} AS is_view,
      notEmpty(coalesce(toString(properties.share_template_id), '')) AS share_mark, ${PATH_COLUMN},
      ${users} AS is_user, ${sourceColumns(promoters)}
    FROM events
    WHERE timestamp >= ${since} AND timestamp < ${until} AND event IN ('$pageview', 'signup')
      AND person_id IN (SELECT person_id FROM events WHERE ${users} AND timestamp >= ${since} AND timestamp < ${until})
  )
  GROUP BY person_id
)
ARRAY JOIN users AS user_id
LIMIT ${TOUCH_LIMIT}`,
  }
}

// Shares made and share pages opened, per template, in the period (production pages only).
export function sharesQuery(p: Period): HogQL {
  return {
    name: 'insights.shares',
    query: `
SELECT toString(properties.template_id) AS template, countIf(event = 'template_share') AS shares,
  countIf(event = 'template_share_open') AS opens
FROM events
WHERE event IN ('template_share', 'template_share_open') AND ${publicEvent} AND ${period(p)}
GROUP BY template LIMIT 1000`,
  }
}

const visitorRow = z.object({ bucket: label, locale: label, source: label, visitors: count })
const touchRow = z.object({
  user_id: label, source: label, locale: label, shared: z.preprocess((v) => v === 1 || v === true || v === '1', z.boolean()),
  landing: label.optional(), ref_host: label.optional(), utm: label.optional(), medium: label.optional(),
})
const shareRow = z.object({ template: label, shares: count, opens: count })

export type VisitorRow = z.infer<typeof visitorRow>
// landing / refHost / utm / medium: the first public page view's path, referring domain and
// campaign, the fallback of the 「落地页」 and 「来源网站 / utm」 tables (§16.6) for accounts without
// a first-touch row; empty when PostHog has none.
export type Touch = { source: string; locale: 'en' | 'zh' | null; shared: boolean; landing?: string; refHost?: string; utm?: string; medium?: string }
// Plain objects so they survive the 'use cache' round trip.
export type Touches = Record<string, Touch>
export type ShareCounts = Record<string, { shares: number; opens: number }>

export async function loadVisitors(run: RunQuery, p: Period, bucket: Bucket, adminIds: readonly string[], promoters: readonly string[]): Promise<VisitorRow[]> {
  return rowsOf(await run(visitorsQuery(p, bucket, adminIds, promoters)), visitorRow)
}

export async function loadTouches(run: RunQuery, p: Period, userIds: readonly string[], promoters: readonly string[]): Promise<{ touches: Touches; truncated: boolean }> {
  if (!userIds.length) return { touches: {}, truncated: false }
  const rows = rowsOf(await run(touchesQuery(p, userIds, promoters)), touchRow)
  const touches: Touches = {}
  for (const row of rows) {
    const locale = row.source === '' ? null : row.locale === 'zh' ? 'zh' : 'en'
    touches[row.user_id] = { source: row.source, locale, shared: row.shared, landing: row.landing ?? '', refHost: row.ref_host ?? '', utm: row.utm ?? '', medium: row.medium ?? '' }
  }
  return { touches, truncated: rows.length >= TOUCH_LIMIT }
}

export async function loadShares(run: RunQuery, p: Period): Promise<ShareCounts> {
  const result: ShareCounts = {}
  for (const row of rowsOf(await run(sharesQuery(p)), shareRow)) {
    if (row.template) result[row.template] = { shares: row.shares, opens: row.opens }
  }
  return result
}
