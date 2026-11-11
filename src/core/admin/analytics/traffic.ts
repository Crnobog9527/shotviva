import { z } from 'zod'

import { currentPeriod } from './hogql'
import { PostHogQueryError, rowsOf, type HogQL, type RunQuery } from './posthog-query'
import type { Window } from './range'
import { AUTOMATED, EVENT_HOST, EVENT_PATH, NAMED_BOT, publicEntry, scopeOf } from './traffic-scope'
import { count } from './values'

export const CHANNELS = ['google', 'bing', 'chatgpt', 'direct', 'other', 'internal'] as const
export type Channel = (typeof CHANNELS)[number]
export type Traffic = {
  views: number
  visitors: number
  sessions: number
  channels: Record<Channel, number>
  homeEntries: Record<Channel, { en: number; zh: number }>
  identified: number
  suspected: number
  unknown: number
  excluded: Record<'missing' | 'admin' | 'test' | 'nonPublicHost', number>
}

// Entry UTMs beat the referrer. A blank referrer is indistinguishable from direct or stripped.
// Match host boundaries so lookalike domains and unrelated Google services aren't called search.
export function entryChannel(prefix = ''): string {
  const utm = `lower(coalesce(${prefix}$entry_utm_source, ''))`
  const ref = `lower(coalesce(${prefix}$entry_referring_domain, ''))`
  const url = `${prefix}$entry_current_url`
  const google = "'^(www[.])?google[.](com|[a-z]{2}|com[.][a-z]{2}|co[.][a-z]{2})$'"
  return `multiIf(
    ${utm} IN ('google', 'googleads', 'adwords') OR match(${utm}, ${google}), 'google',
    ${utm} IN ('bing','bing.com','microsoftads'), 'bing',
    ${utm} IN ('chatgpt','chatgpt.com','chat.openai.com'), 'chatgpt',
    ${utm} != '', 'other',
    notEmpty(coalesce(${prefix}$entry_gclid, '')), 'google',
    notEmpty(extractURLParameter(${url}, 'msclkid')), 'bing',
    match(${ref}, ${google}), 'google',
    match(${ref}, '(^|[.])bing[.]com$'), 'bing',
    match(${ref}, '(^|[.])chatgpt[.]com$') OR ${ref} = 'chat.openai.com', 'chatgpt',
    ${ref} IN ('www.shotviva.com','shotviva.com'), 'internal',
    ${ref} NOT IN ('', '$direct') OR notEmpty(coalesce(${prefix}$entry_utm_campaign, ''))
      OR notEmpty(coalesce(${prefix}$entry_utm_medium, '')), 'other', 'direct')`
}

export function trafficSessionsQuery(window: Window): HogQL {
  return {
    name: 'traffic.sessions',
    query: `
SELECT ${entryChannel()} AS channel, count() AS sessions,
  countIf($entry_pathname = '/') AS en, countIf($entry_pathname IN ('/zh','/zh/')) AS zh
FROM sessions WHERE ${currentPeriod(window, '$start_timestamp')} AND ${publicEntry()} AND $pageview_count > 0
GROUP BY channel LIMIT 6`,
  }
}

// A named UA is self-identification, never network verification. Without evidence a view is
// unknown. Default posthog-js filters many crawlers before capture, so this cannot count hits.
export function trafficViewsQuery(window: Window): HogQL {
  return {
    name: 'traffic.views',
    query: `
SELECT scope, count() AS views, uniq(person_id) AS visitors,
  countIf(named) AS identified, countIf(NOT named AND automated) AS suspected
FROM (
  SELECT person_id, ${scopeOf(EVENT_HOST, EVENT_PATH)} AS scope,
    ${NAMED_BOT} AS named,
    ${AUTOMATED} AS automated
  FROM events WHERE event = '$pageview' AND ${currentPeriod(window)}
) GROUP BY scope LIMIT 5`,
  }
}

const exclusion = z.enum(['missing', 'admin', 'test', 'nonPublicHost'])
const viewRow = z.object({
  scope: z.union([z.literal('public'), exclusion]),
  views: count,
  visitors: count,
  identified: count,
  suspected: count,
})
const sessionRow = z.object({ channel: z.enum(CHANNELS), sessions: count, en: count, zh: count })

export async function loadTraffic(run: RunQuery, window: Window): Promise<Traffic> {
  const [viewResult, sessionResult] = await Promise.all([run(trafficViewsQuery(window)), run(trafficSessionsQuery(window))])
  const views = rowsOf(viewResult, viewRow)
  const sessions = rowsOf(sessionResult, sessionRow)
  const result: Traffic = {
    views: 0,
    visitors: 0,
    identified: 0,
    suspected: 0,
    unknown: 0,
    sessions: 0,
    excluded: { missing: 0, admin: 0, test: 0, nonPublicHost: 0 },
    channels: { google: 0, bing: 0, chatgpt: 0, direct: 0, other: 0, internal: 0 },
    homeEntries: Object.fromEntries(CHANNELS.map((key) => [key, { en: 0, zh: 0 }])) as Traffic['homeEntries'],
  }
  for (const row of views) {
    if (row.scope !== 'public') result.excluded[row.scope] = row.views
    else {
      const unknown = row.views - row.identified - row.suspected
      if (unknown < 0) throw new PostHogQueryError('bad_response')
      Object.assign(result, { views: row.views, visitors: row.visitors, identified: row.identified, suspected: row.suspected, unknown })
    }
  }
  for (const row of sessions) {
    result.sessions += row.sessions
    result.channels[row.channel] = row.sessions
    result.homeEntries[row.channel] = { en: row.en, zh: row.zh }
  }
  return result
}
