import { z } from 'zod'

import { at, bothPeriods, currentPeriod } from '../analytics/hogql'
import { rowsOf, type HogQL, type RunQuery } from '../analytics/posthog-query'
import type { Window } from '../analytics/range'
import { AUTOMATED, NAMED_BOT, publicEvent } from '../analytics/traffic-scope'
import { count, label } from '../analytics/values'
import { inIds } from './people'

// Where people come from (ARCHITECTURE §16.2b, third phase). Read from the page view itself: its
// URL (promoter ?ref=, ad click ids, utm_*) and its referrer. Anonymous visitors have no person
// properties in this project (person_profiles: identified_only), so $initial_* cannot be used.
// Visitors are grouped by their first page view in the period; people who signed up or paid by
// the first page view PostHog has for them (up to 90 days back).

export const SOURCE_GROUPS = ['search', 'ai', 'social', 'affiliate', 'ads', 'direct', 'other'] as const
export type SourceGroup = (typeof SOURCE_GROUPS)[number]

const AI = [
  'chatgpt[.]com', 'chat[.]openai[.]com', 'perplexity[.]ai', 'claude[.]ai', 'gemini[.]google[.]com', 'copilot[.]microsoft[.]com',
  'poe[.]com', 'you[.]com', 'phind[.]com', 'deepseek[.]com', 'kimi[.]com', 'kimi[.]moonshot[.]cn', 'doubao[.]com',
  'yuanbao[.]tencent[.]com', 'tongyi[.]aliyun[.]com', 'chat[.]mistral[.]ai', 'grok[.]com', 'meta[.]ai',
]
const SOCIAL = [
  'x[.]com', 't[.]co', 'twitter[.]com', 'facebook[.]com', 'fb[.]com', 'instagram[.]com', 'reddit[.]com', 'youtube[.]com',
  'youtu[.]be', 'tiktok[.]com', 'pinterest[.][a-z.]+', 'linkedin[.]com', 'lnkd[.]in', 'threads[.]net', 'xiaohongshu[.]com',
  'xhslink[.]com', 'weibo[.]com', 'zhihu[.]com', 'bilibili[.]com', 'douyin[.]com', 'weixin[.]qq[.]com', 'weixin110[.]qq[.]com',
  'discord[.]com', 't[.]me', 'telegram[.]org', 'producthunt[.]com', 'news[.]ycombinator[.]com',
]
// accounts.google.com (sign-in) and the like are not search: listed hosts only.
const SEARCH = [
  'google[.][a-z.]+', 'bing[.]com', 'duckduckgo[.]com', 'search[.]yahoo[.]com', 'yahoo[.]co[.]jp', 'baidu[.]com', 'yandex[.][a-z.]+',
  'naver[.]com', 'ecosia[.]org', 'sogou[.]com', 'so[.]com', 'search[.]brave[.]com', 'startpage[.]com',
]
// Coming back from our own pages, sign-in or a checkout page is not where someone came from.
const RETURNS = ['shotviva[.]com', 'accounts[.]google[.]com', 'appleid[.]apple[.]com', 'checkout[.]stripe[.]com', 'pay[.]stripe[.]com', '[a-z0-9-]*[.]?waffo[.][a-z.]+']

const domains = (list: readonly string[]) => `'^([a-z0-9-]+[.])*(${list.join('|')})$'`
const SEARCH_HOSTS = `'^(www[.])?(${SEARCH.join('|')})$'`
const UTM = {
  ai: "'^(chatgpt|chatgpt[.]com|openai|perplexity|claude|gemini|copilot|deepseek|kimi|doubao)'",
  social: "'^(twitter|x|t[.]co|facebook|fb|instagram|ig|reddit|youtube|tiktok|pinterest|linkedin|threads|xiaohongshu|xhs|rednote|weibo|zhihu|bilibili|douyin|wechat|weixin|discord|telegram)'",
  search: "'^(google|bing|baidu|duckduckgo|yahoo|yandex|naver)'",
}

// The group of one event, from its own properties. Order matters: a promoter link wins, then a
// paid click, then the utm source, then the referrer.
export function sourceGroup(): string {
  const url = 'coalesce(toString(properties.$current_url), \'\')'
  const src = "lower(coalesce(toString(properties.utm_source), ''))"
  const medium = "lower(coalesce(toString(properties.utm_medium), ''))"
  const ref = "lower(coalesce(toString(properties.$referring_domain), ''))"
  const param = (name: string) => `notEmpty(extractURLParameter(${url}, '${name}'))`
  return `multiIf(
    ${param('ref')}, 'affiliate',
    ${param('gclid')} OR ${param('msclkid')} OR ${param('ttclid')} OR match(${medium}, '^(cpc|ppc|paid.*|ads?|display|cpm)$'), 'ads',
    match(${src}, ${UTM.ai}), 'ai',
    match(${src}, ${UTM.social}), 'social',
    match(${src}, ${UTM.search}), 'search',
    ${src} != '', 'other',
    match(${ref}, ${domains(AI)}), 'ai',
    match(${ref}, ${domains(SOCIAL)}), 'social',
    match(${ref}, ${SEARCH_HOSTS}), 'search',
    ${ref} IN ('', '$direct') OR match(${ref}, ${domains(RETURNS)}), 'direct',
    'other')`
}

const notBot = `NOT ((${NAMED_BOT}) OR ${AUTOMATED})`

// Visitors per group, each by their first public page view in the current period (admins and
// automation left out, like 「访客」).
export function visitorsBySourceQuery(window: Window, adminIds: readonly string[]): HogQL {
  const internal = adminIds.length
    ? `person_id NOT IN (SELECT person_id FROM events WHERE ${inIds('distinct_id', adminIds)} AND ${bothPeriods(window)})`
    : 'true'
  return {
    name: 'growth.sources.visitors',
    query: `
SELECT grp, count() AS visitors
FROM (
  SELECT person_id, argMin(${sourceGroup()}, timestamp) AS grp
  FROM events
  WHERE event = '$pageview' AND ${publicEvent} AND ${currentPeriod(window)} AND ${notBot} AND ${internal}
  GROUP BY person_id
)
GROUP BY grp LIMIT 10`,
  }
}

const LOOKBACK_DAYS = 90

// For each user id: the group of the first public page view of the PostHog person they are
// (anonymous views before sign-in included, which PostHog merged into them). Empty when none.
export function firstTouchQuery(window: Window, userIds: readonly string[]): HogQL {
  const since = at(new Date(Date.parse(window.start) - LOOKBACK_DAYS * 86_400_000).toISOString())
  const until = at(window.end)
  return {
    name: 'growth.sources.first_touch',
    query: `
SELECT user_id, grp
FROM (
  SELECT person_id, argMinIf(${sourceGroup()}, timestamp, event = '$pageview' AND ${publicEvent}) AS grp,
    groupUniqArrayIf(distinct_id, ${inIds('distinct_id', userIds)}) AS users
  FROM events
  WHERE timestamp >= ${since} AND timestamp < ${until}
    AND person_id IN (SELECT person_id FROM events WHERE ${inIds('distinct_id', userIds)} AND timestamp >= ${since} AND timestamp < ${until})
  GROUP BY person_id
)
ARRAY JOIN users AS user_id
LIMIT 10000`,
  }
}

const groupLabel = z.preprocess((value) => (SOURCE_GROUPS as readonly unknown[]).includes(value) ? value : 'other', z.enum(SOURCE_GROUPS))
const visitorRow = z.object({ grp: groupLabel, visitors: count })
const touchRow = z.object({ user_id: label, grp: label })

export type VisitorsBySource = Record<SourceGroup, number>
// A plain object (not a Map) so it survives the 'use cache' round trip.
export type FirstTouch = Record<string, SourceGroup>

export function shapeVisitors(rows: z.infer<typeof visitorRow>[]): VisitorsBySource {
  const result = Object.fromEntries(SOURCE_GROUPS.map((g) => [g, 0])) as VisitorsBySource
  for (const row of rows) result[row.grp] += row.visitors
  return result
}

// A person with no public page view in range has an empty group: they are left out of the map.
export function shapeFirstTouch(rows: z.infer<typeof touchRow>[]): FirstTouch {
  const map: FirstTouch = {}
  for (const row of rows) {
    if ((SOURCE_GROUPS as readonly string[]).includes(row.grp)) map[row.user_id] = row.grp as SourceGroup
  }
  return map
}

export type SourceReads = { visitors: VisitorsBySource; firstTouch: FirstTouch }

export async function loadSources(run: RunQuery, window: Window, adminIds: readonly string[], userIds: readonly string[]): Promise<SourceReads> {
  const visitors = shapeVisitors(rowsOf(await run(visitorsBySourceQuery(window, adminIds)), visitorRow))
  const firstTouch = userIds.length ? shapeFirstTouch(rowsOf(await run(firstTouchQuery(window, userIds)), touchRow)) : {}
  return { visitors, firstTouch }
}
