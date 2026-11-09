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

const columns = 'id,module,name,description,category_key,translations,fields,quality,credits_cost,visible_in,' +
  'cover_before_url,cover_after_url,cover_media_type,cover_video_url,cover_poster_url,cover_locales,' +
  'template_prompts(body,version,model_params,provider_id,ai_providers(adapter,model,base_url))'
const prompt = z.object({
  body: z.string().min(1), version: z.int().positive(), model_params: z.record(z.string(), z.unknown()),
  provider_id: z.uuid().nullable(),
  ai_providers: z.object({ adapter: z.string(), model: z.string(), base_url: z.string() }).nullable(),
})

export type SyncTarget = { db: SupabaseClient; assets: Assets }
type Floors = CreditsFloor & { providers?: Record<string, CreditsFloor> }

export async function syncTemplate(id: string, runId: string, source: SyncTarget, target: SyncTarget, floors: Floors) {
  // A lost response or a re-run of a partly failed batch should not re-read or upload a
  // newer source over an already committed id. The RPC repeats this check under its lock.
  const receipt = await target.db.from('template_sync_history').select('synced_version')
    .eq('template_id', id).eq('run_id', runId).maybeSingle()
  if (receipt.error) throw new SyncError('TARGET_READ_FAILED')
  if (receipt.data) return receipt.data.synced_version as number

  const { data, error } = await source.db.from('templates').select(columns).eq('id', id).maybeSingle()
  if (error) throw new SyncError('SOURCE_READ_FAILED')
  if (!data) throw new SyncError('TEMPLATE_MISSING')
  const { template_prompts, ...row } = data as unknown as Record<string, unknown>
  const parsed = prompt.safeParse(template_prompts)
  if (!parsed.success) throw new SyncError('PROMPT_MISSING_OR_INVALID')
  const { provider_id, ai_providers, ...revision } = parsed.data
  if (provider_id && !ai_providers) throw new SyncError('PROVIDER_NOT_UNIQUE')
  const fields = templateFieldsSchema.safeParse(row.fields)
  if (!fields.success || toggleSetupProblems(fields.data.toggles, revision.body, revision.model_params).length) {
    throw new SyncError('INVALID_FIELDS_OR_TOGGLES')
  }
  async function apply(template: Record<string, unknown>, validate: boolean) {
    const write = await target.db.rpc('sync_preview_template', {
      p_template: template, p_prompt: revision, p_provider: ai_providers, p_floors: floors,
      p_run_id: runId, p_locales: LOCALES, p_validate_only: validate,
    })
    if (write.error) {
      const known = ['CATEGORY_MISSING', 'MODEL_CREDIT_FLOOR', 'MODEL_CHANGED', 'MODEL_REFERENCE_LIMIT',
        'FEATURED_WEB_REQUIRED', 'LIVE_TEMPLATE_INCOMPLETE', 'PROVIDER_NOT_UNIQUE']
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
