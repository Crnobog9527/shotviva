import { z } from 'zod'

import { bothPeriods, periodColumn } from '../analytics/hogql'
import { rowsOf, type HogQL, type RunQuery } from '../analytics/posthog-query'
import type { Window } from '../analytics/range'
import { AUTOMATED, NAMED_BOT, publicEvent } from '../analytics/traffic-scope'
import { count, flag } from '../analytics/values'

// The PostHog half of the overview (ARCHITECTURE §16.2b), one query for both periods:
// - visitors: people who opened a public shotviva.com page, without self-named crawlers,
//   automation, or anyone who signed in as an admin during the periods (with that person's
//   earlier anonymous views, which PostHog merged into them);
// - for the people the database says signed up in each period: who uploaded a photo, saw the
//   paywall and started a checkout in it. Only production user ids are asked about, so the test
//   site's server events (same PostHog project, no host on them) cannot be counted.

export type PeopleInput = { adminIds: readonly string[]; cohort: { current: readonly string[]; previous: readonly string[] } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// `column IN ('…', …)`, or false for an empty list (HogQL has no empty IN). Only uuids get in.
export function inIds(column: string, ids: readonly string[]): string {
  const safe = ids.filter((id) => UUID.test(id)).map((id) => `'${id.toLowerCase()}'`)
  return safe.length ? `${column} IN (${safe.join(', ')})` : 'false'
}

export function peopleQuery(window: Window, input: PeopleInput): HogQL {
  const cur = periodColumn(window)
  const internal = input.adminIds.length
    ? `person_id IN (SELECT person_id FROM events WHERE ${inIds('distinct_id', input.adminIds)} AND ${bothPeriods(window)})`
    : 'false'
  const member = `if(${cur}, ${inIds('distinct_id', input.cohort.current)}, ${inIds('distinct_id', input.cohort.previous)})`
  return {
    name: 'growth.people',
    query: `
SELECT cur,
  uniqIf(person_id, is_view AND NOT bot AND NOT internal) AS visitors,
  countIf(is_view AND bot) AS bot_views,
  uniqIf(distinct_id, event = 'upload' AND member) AS uploaded,
  uniqIf(distinct_id, event = 'paywall_view' AND member) AS paywall,
  uniqIf(distinct_id, event = 'checkout_start' AND member) AS checkout
FROM (
  SELECT event, distinct_id, person_id, ${cur} AS cur, event = '$pageview' AS is_view,
    (${NAMED_BOT}) OR ${AUTOMATED} AS bot,
    ${internal} AS internal,
    ${member} AS member
  FROM events
  WHERE event IN ('$pageview', 'upload', 'paywall_view', 'checkout_start') AND ${bothPeriods(window)}
    AND (event = 'checkout_start' OR ${publicEvent})
)
GROUP BY cur LIMIT 2`,
  }
}

const peopleRow = z.object({ cur: flag, visitors: count, bot_views: count, uploaded: count, paywall: count, checkout: count })

export type PeopleStats = { visitors: number; botViews: number; uploaded: number; paywall: number; checkout: number }
export type People = { current: PeopleStats; previous: PeopleStats }

const ZERO: PeopleStats = { visitors: 0, botViews: 0, uploaded: 0, paywall: 0, checkout: 0 }

export function shapePeople(rows: z.infer<typeof peopleRow>[]): People {
  const of = (cur: boolean): PeopleStats => {
    const row = rows.find((r) => r.cur === cur)
    return row ? { visitors: row.visitors, botViews: row.bot_views, uploaded: row.uploaded, paywall: row.paywall, checkout: row.checkout } : ZERO
  }
  return { current: of(true), previous: of(false) }
}

export async function loadPeople(run: RunQuery, window: Window, input: PeopleInput): Promise<People> {
  return shapePeople(rowsOf(await run(peopleQuery(window, input)), peopleRow))
}
