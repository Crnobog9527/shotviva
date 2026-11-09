import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { LOCALES } from '../../src/core/i18n/locales'
import type { CreditsFloor } from '../../src/core/templates/pricing'
import { templateFieldsSchema } from '../../src/core/templates/schema'
import { toggleSetupProblems } from '../../src/core/templates/toggles'
import { copyCovers, SyncError, type Assets } from './covers'

export const slug = z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
export function parseIds(input: string) {
  return [...new Set(z.array(slug).min(1).parse(input.trim().split(/[\s,]+/)))]
}

const prompt = z.object({
  body: z.string().min(1), version: z.int().positive(), model_params: z.record(z.string(), z.unknown()),
  provider_id: z.uuid().nullable(),
})

export type SyncTarget = { db: SupabaseClient; assets: Assets }
type Floors = CreditsFloor & { providers?: Record<string, CreditsFloor> }

export async function syncTemplate(id: string, runId: string, source: SyncTarget, target: SyncTarget, floors: Floors) {
  // Pin the destination before reading the source: even a delayed source read must not
  // let an old run adopt a newer destination as its precondition.
  const current = await target.db.rpc('read_template_sync_target', { p_id: id, p_run_id: runId })
  if (current.error) throw new SyncError('TARGET_READ_FAILED')
  const { token, version } = z.object({ token: z.string(), version: z.int().positive().nullable() }).parse(current.data)
  if (version !== null) return version

  const snapshot = await source.db.rpc('read_template_sync_source', { p_id: id })
  if (snapshot.error) throw new SyncError('SOURCE_READ_FAILED')
  if (!snapshot.data) throw new SyncError('TEMPLATE_MISSING')
  const { template: row, catalog, provider, prompt: sourcePrompt } = z.object({
    template: z.record(z.string(), z.unknown()), catalog: z.string(),
    provider: z.object({ adapter: z.string(), model: z.string(), base_url: z.string() }).nullable(),
    prompt: z.unknown(),
  }).parse(snapshot.data)
  const parsed = prompt.safeParse(sourcePrompt)
  if (!parsed.success) throw new SyncError('PROMPT_MISSING_OR_INVALID')
  const { provider_id, ...revision } = parsed.data
  if (provider_id && !provider) throw new SyncError('PROVIDER_NOT_UNIQUE')
  const fields = templateFieldsSchema.safeParse(row.fields)
  if (!fields.success || toggleSetupProblems(fields.data.toggles, revision.body, revision.model_params).length) {
    throw new SyncError('INVALID_FIELDS_OR_TOGGLES')
  }
  async function apply(template: Record<string, unknown>, validate: boolean) {
    const write = await target.db.rpc('sync_preview_template', {
      p_template: template, p_prompt: revision, p_provider: provider, p_floors: floors,
      p_run_id: runId, p_locales: LOCALES, p_target_token: token, p_catalog_version: catalog, p_validate_only: validate,
    })
    if (write.error) {
      const known = ['CATEGORY_MISSING', 'MODEL_CREDIT_FLOOR', 'MODEL_CHANGED', 'MODEL_REFERENCE_LIMIT',
        'STALE_TARGET', 'CATALOG_MISMATCH', 'TEMPLATE_RETIRED', 'FEATURED_WEB_REQUIRED', 'LIVE_TEMPLATE_INCOMPLETE', 'PROVIDER_NOT_UNIQUE']
      throw new SyncError(known.includes(write.error.message) ? write.error.message : 'TARGET_WRITE_FAILED')
    }
    return z.int().positive().parse(write.data)
  }
  await apply(row, true)
  let covers
  try {
    covers = await copyCovers(id, row, source.assets, target.assets)
  } catch (error) {
    throw error instanceof SyncError ? error : new SyncError('COVER_COPY_FAILED')
  }
  return apply({ ...row, ...covers }, false)
}
