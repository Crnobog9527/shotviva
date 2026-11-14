import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'

import type { Period } from './period'

// The database half of the 「漏斗」 and 「模板」 tabs (ARCHITECTURE §16.2c, migrations 1510, 1511).
// Person ids stay on the server: they only steer the PostHog reads.

const count = z.number().int().nonnegative()
const usd = z.coerce.number().nonnegative()
const uuid = z.uuid()

const personSchema = z.object({
  id: uuid,
  signed_at: z.string(),
  locale: z.enum(['en', 'zh']).nullable(),
  graylum: z.boolean(),
  referred: z.boolean(),
  first_image_at: z.string().nullable(),
  first_paid_at: z.string().nullable(),
})

const cohortSchema = z.object({
  timezone: z.literal('Asia/Shanghai'),
  admin_ids: z.array(uuid),
  people: z.array(personSchema),
})

export type CohortPerson = z.infer<typeof personSchema>
export type Cohort = z.infer<typeof cohortSchema>

export function loadCohort(db: RpcClient, period: Period): Promise<Cohort> {
  return callRpc(db, 'admin_funnel_cohort', { p_start: period.start, p_end: period.end }, cohortSchema)
}

const templateSchema = z.object({
  template_id: z.string(),
  name: z.string().nullable(),
  name_zh: z.string().nullable(),
  category_key: z.string().nullable(),
  category_name: z.string().nullable(),
  subcategory_key: z.string().nullable(),
  series_id: uuid.nullable(),
  series_name: z.string().nullable(),
  live: z.boolean(),
  uses: count,
  users: count,
  succeeded: count,
  failed: count,
  redraws: count,
  costed: count,
  cost_usd: usd,
  paid_cost_usd: usd,
  free_cost_usd: usd,
  credits: count,
  paid_credits: count,
  errors: z.array(z.object({ code: z.string(), count })),
  uses_14d: count,
  favourites: count,
  favourites_added: count,
})

const templateStatsSchema = z.object({
  timezone: z.literal('Asia/Shanghai'),
  redraw_minutes: z.number().int().positive(),
  // The first Make again ever recorded (1514); null until there is one, absent before 1514.
  redraw_since: z.string().nullable().optional(),
  templates: z.array(templateSchema),
})

export type TemplateStat = z.infer<typeof templateSchema>
export type TemplateStats = z.infer<typeof templateStatsSchema>

export const REDRAW_MINUTES = 30

export function loadTemplateStats(db: RpcClient, period: Period): Promise<TemplateStats> {
  return callRpc(
    db,
    'admin_template_stats',
    { p_start: period.start, p_end: period.end, p_redraw_minutes: REDRAW_MINUTES },
    templateStatsSchema,
  )
}
