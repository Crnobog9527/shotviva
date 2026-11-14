import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../../logger'
import { posthogAccess } from '../analytics/access'
import { runHogQL } from '../analytics/posthog-query'
import { listExperiments, readResults } from './commands'
import { combine, verdictOf, type VariantResult, type Verdict } from './results'
import type { ExperimentRow } from './schemas'
import { loadVisitors, type VariantVisitors } from './visitors'

// Everything /admin/experiments shows (ARCHITECTURE §16.5): the list, and for experiments that have
// started, the per-variant results. Visitors come from PostHog and may be missing (no key, rate
// limit); the database counts are shown either way.

// Results of the newest started experiments only; older ones are history.
const WITH_RESULTS = 6

export type ExperimentView = {
  row: ExperimentRow
  results: VariantResult[] | null
  verdict: Verdict | null
  // Why visitors are missing: no PostHog key on this deployment, or the read failed.
  visitorsMissing: 'no_access' | 'failed' | null
}

async function visitorsOf(row: ExperimentRow, production: boolean): Promise<{ list: VariantVisitors[] | null; missing: ExperimentView['visitorsMissing'] }> {
  const access = posthogAccess()
  if (!access || !row.started_at) return { list: null, missing: 'no_access' }
  try {
    return { list: await loadVisitors((query) => runHogQL(access, query), row.id, row.started_at, production), missing: null }
  } catch (error) {
    logger.warn('experiments.visitors_read_failed', { error })
    return { list: null, missing: 'failed' }
  }
}

async function viewOf(db: SupabaseClient, row: ExperimentRow, production: boolean, now: number): Promise<ExperimentView> {
  const [counts, visitors] = await Promise.all([readResults(db, row.id), visitorsOf(row, production)])
  const results = combine(row.experiment_variants, counts, visitors.list, row.goal)
  return { row, results, verdict: verdictOf(results, row.started_at, now), visitorsMissing: visitors.missing }
}

export async function loadExperimentViews(db: SupabaseClient, production: boolean, now: number = Date.now()): Promise<ExperimentView[]> {
  const rows = await listExperiments(db)
  const started = new Set(rows.filter((row) => row.status !== 'draft').slice(0, WITH_RESULTS).map((row) => row.id))
  return Promise.all(rows.map((row) => (started.has(row.id) ? viewOf(db, row, production, now) : { row, results: null, verdict: null, visitorsMissing: null })))
}
