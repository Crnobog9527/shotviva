import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { RunError } from '../template-apply/batch-file'
import type { Progress, TrialRun } from './stages'

// Read only: each template's publish state and prompt version, and its admin trial runs (the
// panel keeps the newest 50 per template, plus the ones set as covers). One query each.

const templateRow = z.object({
  id: z.string(), is_active: z.boolean(), updated_at: z.string(),
  template_prompts: z.object({ version: z.int(), updated_at: z.string() }).nullable(),
  template_series: z.object({ slug: z.string() }).nullable(),
})

// The later of the row's and the prompt's last change: what a sync would carry.
const changedAt = (row: z.infer<typeof templateRow>) =>
  [row.updated_at, row.template_prompts?.updated_at].filter((t): t is string => Boolean(t)).sort().at(-1) ?? null
const runRow = z.object({
  id: z.string(), template_id: z.string(), prompt_version: z.int().nullable(), status: z.string(),
  cost_usd: z.coerce.number().nullable(), estimate_usd: z.coerce.number(), output_key: z.string().nullable(),
})

export async function readProgress(db: SupabaseClient, ids: string[]): Promise<Map<string, Progress>> {
  const progress = new Map<string, Progress>(ids.map(id => [id, { exists: false, active: false, version: null, runs: [], changedAt: null, seriesSlug: null }]))
  if (ids.length === 0) return progress
  const templates = await db.from('templates').select('id,is_active,updated_at,template_prompts(version,updated_at),template_series(slug)').in('id', ids)
  const runs = await db.from('admin_test_runs').select('id,template_id,prompt_version,status,cost_usd,estimate_usd,output_key')
    .in('template_id', ids).eq('kind', 'generate').order('created_at', { ascending: false }).limit(5000)
  if (templates.error || runs.error) throw new RunError('读取模板或试跑记录失败')
  for (const row of z.array(templateRow).parse(templates.data)) {
    progress.set(row.id, { exists: true, active: row.is_active, version: row.template_prompts?.version ?? null, runs: [],
      changedAt: changedAt(row), seriesSlug: row.template_series?.slug ?? null })
  }
  for (const row of z.array(runRow).parse(runs.data)) {
    const run: TrialRun = { id: row.id, templateId: row.template_id, promptVersion: row.prompt_version, status: row.status,
      costUsd: row.cost_usd, estimateUsd: row.estimate_usd, outputKey: row.output_key }
    progress.get(row.template_id)?.runs.push(run)
  }
  return progress
}
