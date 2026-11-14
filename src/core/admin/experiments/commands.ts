import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../../errors'
import type { ExperimentRegistry } from '../../experiments'
import { experimentErrorFor, EXPERIMENT_ERRORS } from './errors'
import { actInputSchema, experimentRowSchema, resultRowSchema, saveInputSchema, type ExperimentRow, type ResultRow, type SaveInput } from './schemas'

// /admin/experiments data (ARCHITECTURE §16.5). Service-role client only: the tables refuse every
// client role. Each write is one call to a function that checks the actor and writes the audit log.

// A few experiments ever run at once; the newest 50 cover the history the page shows.
const LIST_LIMIT = 50
const COLUMNS =
  'id, surface, name, goal, status, winner_variant_id, started_at, ended_at, created_at, experiment_variants!experiment_variants_experiment_id_fkey(id, option_id, label, weight, is_control, archived_at, fallback_variant_id)'

const fail = (what: string, error: { message: string; code?: string }): never => {
  const known = experimentErrorFor(error)
  if (known) throw new AppError(known === 'live' ? 'CONFLICT' : 'INVALID_INPUT', EXPERIMENT_ERRORS[known])
  throw new AppError('INTERNAL', `experiments ${what} failed`, { cause: new Error(error.message) })
}

// Newest first; index experiments_created_at_id_idx; variants by their experiment's foreign key.
export async function listExperiments(db: SupabaseClient): Promise<ExperimentRow[]> {
  const { data, error } = await db
    .from('experiments')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .order('id', { ascending: true, referencedTable: 'experiment_variants' })
    .limit(LIST_LIMIT)
  if (error) fail('list', error)
  return experimentRowSchema.array().parse(data)
}

// The input, with every option checked against the code's list for its surface.
export function parseSaveInput(input: unknown, registry: ExperimentRegistry): SaveInput {
  const parsed = saveInputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', EXPERIMENT_ERRORS.input)
  const { surface, variants } = parsed.data
  const known = new Set(registry.find((route) => route.surface === surface)?.options.map((option) => option.id) ?? [])
  if (variants.some((variant) => !known.has(variant.optionId))) throw new AppError('INVALID_INPUT', EXPERIMENT_ERRORS.option)
  if (new Set(variants.map((variant) => variant.optionId)).size !== variants.length) throw new AppError('INVALID_INPUT', EXPERIMENT_ERRORS.duplicate)
  if (variants.filter((variant) => variant.isControl).length !== 1) throw new AppError('INVALID_INPUT', EXPERIMENT_ERRORS.input)
  return parsed.data
}

export async function saveExperiment(db: SupabaseClient, actorId: string, input: unknown, registry: ExperimentRegistry): Promise<number> {
  const parsed = parseSaveInput(input, registry)
  const { data, error } = await db.rpc('admin_experiment_save', {
    p_actor: actorId,
    p_id: parsed.id,
    p_surface: parsed.surface,
    p_name: parsed.name,
    p_goal: parsed.goal,
    p_variants: parsed.variants.map((variant) => ({ option_id: variant.optionId, label: variant.label, weight: variant.weight, is_control: variant.isControl })),
  })
  if (error) fail('save', error)
  return Number(data)
}

export async function actOnExperiment(db: SupabaseClient, actorId: string, input: unknown): Promise<void> {
  const parsed = actInputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', EXPERIMENT_ERRORS.input)
  const { id, action, variant, fallback } = parsed.data
  const { error } = await db.rpc('admin_experiment_act', { p_actor: actorId, p_id: id, p_action: action, p_variant: variant, p_fallback: fallback })
  if (error) fail(action, error)
}

export async function readResults(db: SupabaseClient, id: number): Promise<ResultRow[]> {
  const { data, error } = await db.rpc('admin_experiment_results', { p_id: id })
  if (error) fail('results', error)
  return resultRowSchema.array().parse(data)
}
