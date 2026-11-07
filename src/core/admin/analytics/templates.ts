import { z } from 'zod'

import { currentPeriod } from './hogql'
import { rowsOf, type HogQL, type RunQuery } from './posthog-query'
import type { Window } from './range'
import { count, label, rate } from './values'

// Block 5 「模板表现」 (ARCHITECTURE §16.2a): per template, how often it was looked at
// (template_view), used (generate), how many of those images succeeded, and how many people paid
// after using it. A buyer who used three templates counts once for each of them.

const LIMIT = 40

export function templateUseQuery(window: Window): HogQL {
  return {
    name: 'templates.use',
    query: `
SELECT toString(properties.template_id) AS template,
  countIf(event = 'template_view') AS views,
  countIf(event = 'generate') AS uses,
  countIf(event = 'generate' AND properties.status = 'succeeded') AS succeeded,
  uniqIf(person_id, event = 'generate') AS users
FROM events WHERE event IN ('template_view', 'generate') AND ${currentPeriod(window)}
GROUP BY template ORDER BY uses DESC, views DESC LIMIT ${LIMIT}`,
  }
}

// People who generated with the template and then paid, both inside the period.
export function templateBuyersQuery(window: Window): HogQL {
  return {
    name: 'templates.buyers',
    query: `
SELECT g.template AS template, count() AS buyers
FROM (
  SELECT person_id, toString(properties.template_id) AS template, min(timestamp) AS first_use
  FROM events WHERE event = 'generate' AND ${currentPeriod(window)}
  GROUP BY person_id, template
) AS g
INNER JOIN (
  SELECT person_id, max(timestamp) AS last_paid
  FROM events WHERE event = 'purchase' AND ${currentPeriod(window)}
  GROUP BY person_id
) AS p ON g.person_id = p.person_id
WHERE p.last_paid >= g.first_use
GROUP BY template ORDER BY buyers DESC LIMIT ${LIMIT}`,
  }
}

const useRow = z.object({ template: label, views: count, uses: count, succeeded: count, users: count })
const buyerRow = z.object({ template: label, buyers: count })

export type TemplateRow = {
  templateId: string
  views: number
  uses: number
  users: number
  successRate: number | null
  buyers: number
}

export function shapeTemplates(uses: z.infer<typeof useRow>[], buyers: z.infer<typeof buyerRow>[]): TemplateRow[] {
  const buyersOf = new Map(buyers.map((row) => [row.template, row.buyers]))
  return uses
    .filter((row) => row.template !== '')
    .map((row) => ({
      templateId: row.template,
      views: row.views,
      uses: row.uses,
      users: row.users,
      successRate: rate(row.succeeded, row.uses),
      buyers: buyersOf.get(row.template) ?? 0,
    }))
}

export async function loadTemplates(run: RunQuery, window: Window): Promise<TemplateRow[]> {
  const uses = rowsOf(await run(templateUseQuery(window)), useRow)
  const buyers = rowsOf(await run(templateBuyersQuery(window)), buyerRow)
  return shapeTemplates(uses, buyers)
}
