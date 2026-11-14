import { z } from 'zod'

import { EVENT_HOST } from '../analytics/traffic-scope'
import { rowsOf, type HogQL, type RunQuery } from '../analytics/posthog-query'
import { count } from '../analytics/values'

// Visitors per variant (ARCHITECTURE §16.5), from the experiment_exposure events the browser
// sends once per assignment: `visitors` = new assignments (counted against the variant they were
// put on, which is their first), `movedIn` = people moved onto it when another was archived.
// Counted per event, not per PostHog person: a visitor without cookie consent is a new person on
// every page, but reports an assignment once. The test site shares the PostHog project and its own
// experiment ids, so production counts shotviva.com only and the test site everything else.

export type VariantVisitors = { variantId: number; visitors: number; movedIn: number }

export function visitorsQuery(experimentId: number, since: string, production: boolean): HogQL {
  const host = `lower(${EVENT_HOST})`
  return {
    name: 'experiments.visitors',
    query: `
SELECT toInt64OrZero(toString(properties.variant_id)) AS variant_id,
  countIf(toString(properties.reassigned) IN ('false', '0')) AS visitors,
  countIf(toString(properties.reassigned) IN ('true', '1')) AS moved_in
FROM events
WHERE event = 'experiment_exposure'
  AND toInt64OrZero(toString(properties.experiment_id)) = ${Math.trunc(experimentId)}
  AND timestamp >= toDateTime('${since.slice(0, 19).replace('T', ' ')}', 'UTC')
  AND ${production ? `${host} = 'shotviva.com'` : `${host} != 'shotviva.com'`}
GROUP BY variant_id
LIMIT 20`,
  }
}

const row = z.object({ variant_id: count, visitors: count, moved_in: count })

export async function loadVisitors(run: RunQuery, experimentId: number, since: string, production: boolean): Promise<VariantVisitors[]> {
  return rowsOf(await run(visitorsQuery(experimentId, since, production)), row).map((r) => ({ variantId: r.variant_id, visitors: r.visitors, movedIn: r.moved_in }))
}
