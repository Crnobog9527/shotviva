import 'server-only'

import { z } from 'zod'

import { track as defaultTrack, type EventProps, type ServerTrack } from '../analytics'
import { categorySlug } from '../analytics/events'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locales'
import { EDIT_SCOPES } from '../templates/edit-params'
import { storedSlotOrder } from '../templates/image-slots'
import { GenerationFailure } from './generation-failure'
import type { Job } from './job-schema'
import { modelFromTag } from './provider-tag'

// Pre-T16 jobs carry no resolution and every one of them is generated at 1K.
const resolution = z.enum(['1k', '2k', '3k']).catch('1k')
// Only edits carry a scope (T30); a template generation has none.
const editScope = z.enum(EDIT_SCOPES).nullable().catch(null)
const jobToggles = z.record(z.string(), z.boolean()).catch({})

// The category as the event dictionary takes it (moved to events.ts in T74 so the browser's
// template_view sends the same value). Re-exported for the existing callers and tests.
export { categorySlug }

type Outcome = { status: 'succeeded' } | { status: 'failed'; errorCode: string | null }

export function generateEventProps(job: Job, category: string, outcome: Outcome, durationMs: number, batchSize = 1): EventProps<'generate'> {
  return {
    template_id: job.templateId,
    category: categorySlug(category),
    resolution: resolution.parse(job.inputs.resolution),
    credits_cost: job.creditsCost,
    credit_pool: job.creditPool,
    status: outcome.status,
    error_code: outcome.status === 'failed' ? outcome.errorCode : null,
    source: job.source,
    duration_ms: Math.max(0, Math.round(durationMs)),
    // The model only: the provider id and its address stay out of analytics (§16.2).
    model: modelFromTag(job.provider),
    // 1 for a single photo and every partner job (T28).
    batch_size: batchSize,
    batch_templates: z.int().min(1).max(5).catch(1).parse(job.inputs.batch_templates),
    edit_scope: editScope.parse(job.inputs.edit_scope ?? null),
    // As stored on the job (T89); a template without toggles stores none.
    toggles: jobToggles.parse(job.inputs.toggles ?? {}),
    slots_filled: storedSlotOrder(job.inputs.input_slots),
  }
}

// `generate` (ARCHITECTURE §16.2) once per settled job, success or failure, for the web and
// the partner route alike (both settle here). Replays and lost reservation races never settle,
// so they never send a second event.
export async function settleTracked<T>(
  job: Job,
  category: string,
  settle: () => Promise<T>,
  options: { track?: ServerTrack; now?: () => number; batchSize?: number; locale?: Locale } = {},
): Promise<T> {
  const track = options.track ?? defaultTrack
  const now = options.now ?? Date.now
  const ctx = { distinctId: job.userId, locale: options.locale ?? DEFAULT_LOCALE }
  const started = now()
  try {
    const settled = await settle()
    track('generate', generateEventProps(job, category, { status: 'succeeded' }, now() - started, options.batchSize), ctx)
    return settled
  } catch (error) {
    const errorCode = error instanceof GenerationFailure ? error.jobCode : null
    track('generate', generateEventProps(job, category, { status: 'failed', errorCode }, now() - started, options.batchSize), ctx)
    throw error
  }
}
