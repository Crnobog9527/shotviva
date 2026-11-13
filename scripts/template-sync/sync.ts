import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { site } from '../../src/site/site.config'
import { slotSurfaceProblems, templateFieldsSchema, toggleSetupProblems } from '../../src/core/templates'
import { readTemplateQuote } from '../../src/site/template-pricing'
import { styleRefsSchema } from '../../src/core/templates/style-refs'
import { copyCovers, SyncError, type Assets } from './covers'
import { copyStyleRefs, type PrivateStore } from './style-refs'

// Template ids (up to 64) and series slugs (up to 128, as the series editor allows) share this list.
export const slug = z.string().max(128).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
export function parseIds(input: string) {
  return [...new Set(z.array(slug).min(1).parse(input.trim().split(/[\s,]+/)))]
}

const prompt = z.object({
  body: z.string().min(1), version: z.int().positive(), model_params: z.record(z.string(), z.unknown()),
  provider_id: z.uuid().nullable(),
})

// `private`: the side's private uploads bucket, for style references; absent where none is set up.
export type SyncTarget = { db: SupabaseClient; assets: Assets; private?: PrivateStore }

// The test site's style references for the prompt version just read (2026-11-12), so references
// and prompt always come from one revision; SOURCE_CHANGED when an edit landed in between.
async function readStyleRefs(id: string, version: number, source: SyncTarget) {
  const result = await source.db.rpc('read_template_sync_style_refs', { p_id: id, p_version: version })
  if (result.error) throw new SyncError(result.error.message === 'SOURCE_CHANGED' ? 'SOURCE_CHANGED' : 'SOURCE_READ_FAILED')
  const refs = styleRefsSchema.safeParse(result.data)
  if (!refs.success) throw new SyncError('INVALID_STYLE_REFS')
  return refs.data
}

// Both provider profiles (1393): which one is live on the test site, and the other one as it is
// saved there, for exactly the prompt version the sync read.
const profileKey = z.enum(['openai', 'seedream'])
const inactiveProfile = z.object({
  profile: profileKey, body: z.string().min(1), model_params: z.record(z.string(), z.unknown()), style_refs: styleRefsSchema,
  provider: z.object({ adapter: z.string(), model: z.string(), base_url: z.string() }).nullable(),
  provider_missing: z.boolean(), quality: z.enum(['high', 'medium']), credits_cost: z.record(z.string(), z.number()),
  unpriced_resolutions: z.array(z.string()),
})
const profilesSchema = z.object({ active: profileKey, inactive: z.array(inactiveProfile).max(1) })

async function readProfiles(id: string, version: number, source: SyncTarget) {
  const result = await source.db.rpc('read_template_sync_profiles', { p_id: id, p_version: version })
  // A test site without migration 1393: sync as before (no profiles; the 9-argument function).
  if (result.error?.code === 'PGRST202') return null
  if (result.error) throw new SyncError(result.error.message === 'SOURCE_CHANGED' ? 'SOURCE_CHANGED' : 'SOURCE_READ_FAILED')
  const parsed = profilesSchema.safeParse(result.data)
  if (!parsed.success) throw new SyncError('INVALID_PROFILES')
  // The test site's own inactive binding points at no model row (deleted after it was saved).
  if (parsed.data.inactive.some(entry => entry.provider_missing)) throw new SyncError('SOURCE_PROVIDER_MISSING')
  return {
    active: parsed.data.active,
    inactive: parsed.data.inactive.map(({ provider_missing, ...entry }) => (void provider_missing, entry)),
  }
}

async function copyRefs(id: string, refs: Awaited<ReturnType<typeof readStyleRefs>>, source: SyncTarget, target: SyncTarget) {
  if (refs.length === 0) return
  if (!source.private || !target.private) throw new SyncError('STYLE_REF_STORE_MISSING')
  try {
    await copyStyleRefs(id, refs, source.private, target.private)
  } catch (error) {
    throw error instanceof SyncError ? error : new SyncError('STYLE_REF_COPY_FAILED')
  }
}

// `validateOnly`: run every check of the final write inside the target's transaction and roll it
// back (the RPC's p_validate_only); no covers or style references are copied. Used by the dry run
// against the preview. Style references go as the test site has them (an empty list clears
// production's), their objects copied to production's private bucket before the final write.
export async function syncTemplate(id: string, runId: string, source: SyncTarget, target: SyncTarget, validateOnly = false) {
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
  // The test site's own binding points at no image model row (deleted, or another module).
  if (provider_id && !provider) throw new SyncError('SOURCE_PROVIDER_MISSING')
  const fields = templateFieldsSchema.safeParse(row.fields)
  const surfaces = z.array(z.string()).catch([]).parse(row.visible_in)
  if (!fields.success || toggleSetupProblems(fields.data.toggles, revision.body, revision.model_params).length
    || slotSurfaceProblems(fields.data, surfaces).length) {
    throw new SyncError('INVALID_FIELDS_OR_TOGGLES')
  }
  const styleRefs = await readStyleRefs(id, revision.version, source)
  const profiles = await readProfiles(id, revision.version, source)
  const otherRefs = profiles?.inactive.flatMap(entry => entry.style_refs) ?? []
  async function apply(template: Record<string, unknown>, validate: boolean) {
    // An upload can outlast a model estimate or p95 update. Price again at the write,
    // through exactly the editor's read-and-save path, including its approved exceptions.
    const { floors, receipt, envModel } = await readTemplateQuote(target.db)
    const write = await target.db.rpc('sync_preview_template', {
      p_template: template, p_prompt: { ...revision, style_refs: styleRefs }, p_provider: provider, p_floors: { ...floors, quote_receipt: receipt, env_model: envModel },
      p_run_id: runId, p_locales: site.locales.enabled, p_target_token: token, p_catalog_version: catalog, ...(profiles ? { p_profiles: profiles } : {}), p_validate_only: validate,
    })
    if (write.error) {
      const known = ['CATEGORY_MISSING', 'SUBCATEGORY_MISSING', 'SERIES_MISSING', 'MODEL_CREDIT_FLOOR', 'MODEL_CHANGED', 'MODEL_REFERENCE_LIMIT',
        'STALE_TARGET', 'PRICE_QUOTE_CHANGED', 'CATALOG_MISMATCH', 'TEMPLATE_RETIRED', 'FEATURED_WEB_REQUIRED', 'LIVE_TEMPLATE_INCOMPLETE', 'PROVIDER_NOT_UNIQUE',
        'PROVIDER_MISSING', 'INVALID_STYLE_REFS', 'INVALID_SYNC', 'PROFILE_PROVIDER_MISMATCH']
      throw new SyncError(known.includes(write.error.message) ? write.error.message : 'TARGET_WRITE_FAILED')
    }
    return z.int().positive().parse(write.data)
  }
  const checked = await apply(row, true)
  if (validateOnly) return checked
  // Before any object is copied, so a missing bucket costs no cover copy on every run.
  if (styleRefs.length + otherRefs.length > 0 && (!source.private || !target.private)) throw new SyncError('STYLE_REF_STORE_MISSING')
  let covers
  try {
    covers = await copyCovers(id, row, source.assets, target.assets)
  } catch (error) {
    throw error instanceof SyncError ? error : new SyncError('COVER_COPY_FAILED')
  }
  // The inactive profile's references too, so switching on production finds their objects.
  await copyRefs(id, [...styleRefs, ...otherRefs.filter(ref => !styleRefs.some(live => live.key === ref.key))], source, target)
  return apply({ ...row, ...covers }, false)
}
