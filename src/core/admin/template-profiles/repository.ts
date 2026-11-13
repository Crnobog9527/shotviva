import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { creditsCostSchema, TEMPLATE_QUALITIES } from '@/core/templates/pricing'
import { resolutionSchema } from '@/core/templates/db-resolution'
import { styleRefsSchema } from '@/core/templates/style-refs'

import { profileCopy as copy, switchErrorText } from './copy'
import { PROFILES, type DriftRow, type ImageModel, type ProfileDetail, type ProfileKey, type ProfileTemplate, type SaveProfileInput, type SwitchInput, type SwitchRow } from './types'

// Every function expects a service-role client; callers must have passed requireAdmin().

const PAGE = 500
const profileKey = z.enum(PROFILES)
const unmatched = z.object({ adapter: z.string(), model: z.string(), base_url: z.string() }).nullable()
const summaryRow = z.object({
  profile: profileKey, prompt_version: z.int().positive(), quality: z.enum(TEMPLATE_QUALITIES), credits_cost: creditsCostSchema,
  unpriced_resolutions: z.array(resolutionSchema), provider_unmatched: unmatched, updated_at: z.string(),
  template_prompt_versions: z.object({ provider_id: z.string().nullable() }).nullable().optional(),
})
const templateRow = z.object({
  id: z.string(), name: z.string(), category_key: z.string(), series_id: z.string().nullable(), is_active: z.boolean(),
  translations: z.unknown(), fields: z.unknown(),
  template_prompts: z.object({ active_profile: profileKey, provider_id: z.string().nullable() }).nullable(),
  template_profiles: z.array(summaryRow),
})

const toSummary = (row: z.infer<typeof summaryRow>) => ({
  profile: row.profile, version: row.prompt_version, quality: row.quality, creditsCost: row.credits_cost,
  unpricedResolutions: row.unpriced_resolutions, providerUnmatched: row.provider_unmatched, updatedAt: row.updated_at,
  providerId: row.template_prompt_versions?.provider_id ?? null,
})

const zhName = (translations: unknown) => z.object({ zh: z.object({ name: z.string() }) }).safeParse(translations).data?.zh.name ?? null
const slotCount = (fields: unknown) => z.object({ images: z.object({ slots: z.array(z.unknown()) }) }).safeParse(fields).data?.images.slots.length ?? 0

// Whether this database has provider profiles (migrations 1440–1444). The test site's database
// gets migrations only from a merge to main, so a branch deployed there before can lack them.
export async function profilesInstalled(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from('template_profiles').select('template_id').limit(1)
  if (!error) return true
  if (['42P01', 'PGRST205'].includes(error.code ?? '')) return false
  throw new AppError('INTERNAL', 'profilesInstalled failed', { cause: error })
}

// Every template that can carry profiles (the built-in edit and freeform templates cannot).
export async function listProfileTemplates(db: SupabaseClient): Promise<ProfileTemplate[]> {
  const rows: z.infer<typeof templateRow>[] = []
  for (let after = ''; ;) {
    const { data, error } = await db.from('templates')
      .select('id, name, category_key, series_id, is_active, translations, fields, template_prompts(active_profile, provider_id), template_profiles(profile, prompt_version, quality, credits_cost, unpriced_resolutions, provider_unmatched, updated_at, template_prompt_versions(provider_id))')
      .not('id', 'in', '(edit,freeform)').is('deleted_at', null).gt('id', after).order('id').limit(PAGE)
    if (error) throw new AppError('INTERNAL', 'listProfileTemplates failed', { cause: error })
    const page = z.array(templateRow).parse(data)
    rows.push(...page)
    if (page.length < PAGE) break
    after = page[page.length - 1].id
  }
  return rows.filter(row => row.template_prompts).map(row => ({
    id: row.id, name: row.name, nameZh: zhName(row.translations), category: row.category_key, seriesId: row.series_id,
    isActive: row.is_active, slots: slotCount(row.fields), active: row.template_prompts!.active_profile,
    liveProviderId: row.template_prompts!.provider_id,
    profiles: Object.fromEntries(row.template_profiles.map(p => [p.profile, toSummary(p)])),
  }))
}

const versionRow = z.object({
  body: z.string(), model_params: z.record(z.string(), z.unknown()), style_refs: styleRefsSchema,
  provider_id: z.string().nullable(), provider_model: z.string().nullable(),
})

// One profile with its prompt (from its immutable version snapshot).
export async function getProfileDetail(db: SupabaseClient, id: string, profile: ProfileKey): Promise<ProfileDetail | null> {
  const { data, error } = await db.from('template_profiles')
    .select('profile, prompt_version, quality, credits_cost, unpriced_resolutions, provider_unmatched, updated_at')
    .eq('template_id', id).eq('profile', profile).maybeSingle()
  if (error) throw new AppError('INTERNAL', 'getProfileDetail failed', { cause: error })
  if (!data) return null
  const summary = summaryRow.parse(data)
  const version = await db.from('template_prompt_versions')
    .select('body, model_params, style_refs, provider_id, provider_model')
    .eq('template_id', id).eq('version', summary.prompt_version).single()
  if (version.error) throw new AppError('INTERNAL', 'getProfileDetail version failed', { cause: version.error })
  const v = versionRow.parse(version.data)
  return { ...toSummary(summary), body: v.body, modelParams: v.model_params, styleRefs: v.style_refs, providerId: v.provider_id, providerModel: v.provider_model }
}

export async function listImageModels(db: SupabaseClient): Promise<ImageModel[]> {
  const { data, error } = await db.from('ai_providers').select('id, label, model, adapter, is_active').eq('module', 'image').order('label')
  if (error) throw new AppError('INTERNAL', 'listImageModels failed', { cause: error })
  return z.array(z.object({ id: z.string(), label: z.string(), model: z.string(), adapter: z.string(), is_active: z.boolean() })).parse(data)
    .map(row => ({ id: row.id, label: row.label, model: row.model, adapter: row.adapter, isActive: row.is_active }))
}

const SAVE_ERRORS: Record<string, string> = {
  PROFILE_ACTIVE: copy.saveActive, STALE_PROMPT: copy.stale, INVALID_STYLE_REFS: copy.invalidRefs,
  PROVIDER_NOT_IMAGE: copy.providerGone, INVALID_INPUT: copy.invalid, TEMPLATE_NOT_FOUND: copy.missingTemplate,
}

const saveSchema = z.object({
  id: z.string().min(1).max(64), profile: profileKey, expected: z.int().positive().nullable(),
  providerId: z.uuid().nullable(), body: z.string().trim().min(1).max(32000), modelParams: z.record(z.string(), z.unknown()),
  styleRefs: styleRefsSchema, quality: z.enum(TEMPLATE_QUALITIES), creditsCost: creditsCostSchema,
  unpricedResolutions: z.array(resolutionSchema).max(2),
})

// Saves the profile that is not live (1441); the live one is edited in the template editor.
export async function saveTemplateProfile(db: SupabaseClient, actor: string, input: SaveProfileInput): Promise<number> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', copy.invalid)
  const p = parsed.data
  const { data, error } = await db.rpc('admin_save_template_profile', {
    p_actor: actor, p_id: p.id, p_profile: p.profile, p_expected: p.expected,
    p_prompt: { body: p.body, model_params: p.modelParams, provider_id: p.providerId, style_refs: p.styleRefs },
    p_quality: p.quality, p_credits_cost: p.creditsCost, p_unpriced: p.unpricedResolutions,
  })
  if (error) {
    if (error.message === 'NOT_ADMIN') throw new AppError('FORBIDDEN', copy.forbidden)
    if (error.message === 'PROFILE_PROVIDER_MISMATCH') throw new AppError('INVALID_INPUT', error.details)
    if (SAVE_ERRORS[error.message]) throw new AppError('INVALID_INPUT', SAVE_ERRORS[error.message])
    throw new AppError('INTERNAL', 'admin_save_template_profile failed', { cause: error })
  }
  logger.info('admin.template_profile.saved', { adminId: actor, templateId: p.id, profile: p.profile })
  return z.int().positive().parse(data)
}

async function scopeIds(db: SupabaseClient, input: SwitchInput['scope']): Promise<string[]> {
  if (input.kind === 'ids') return input.ids
  const { data, error } = await db.rpc('admin_template_profile_scope', {
    p_scope: input.kind, p_key: input.kind === 'category' ? input.key : input.kind === 'series' ? input.key : null,
  })
  if (error) throw new AppError('INTERNAL', 'admin_template_profile_scope failed', { cause: error })
  return z.array(z.string()).parse(data)
}

const side = z.object({ resolutions: z.array(resolutionSchema).catch([]), credits: creditsCostSchema })
const reportSchema = z.array(z.union([
  z.object({ id: z.string(), ok: z.literal(true), unchanged: z.boolean().optional(), from: profileKey, to: profileKey, before: side, after: side }),
  z.object({ id: z.string(), ok: z.literal(false), code: z.string(), detail: z.string().nullable().optional() })
    .transform(row => ({ ...row, detail: row.detail ?? null })),
]))

const switchSchema = z.object({
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('site') }),
    z.object({ kind: z.literal('category'), key: z.string().min(1).max(64) }),
    z.object({ kind: z.literal('series'), key: z.string().min(1).max(128) }),
    z.object({ kind: z.literal('ids'), ids: z.array(z.string().min(1).max(64)).min(1).max(300) }),
  ]),
  target: profileKey, reason: z.string().trim().min(1).max(200), validateOnly: z.boolean(),
})

// Preview (validateOnly) or switch every template of the scope (1441). Never unpublishes: a
// template that cannot switch stays on its profile and is reported with its reason.
export async function switchTemplateProfiles(db: SupabaseClient, actor: string, input: SwitchInput): Promise<SwitchRow[]> {
  const parsed = switchSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', copy.switchInvalid)
  const { scope, target, reason, validateOnly } = parsed.data
  const ids = await scopeIds(db, scope)
  if (ids.length === 0) return []
  if (ids.length > 300) throw new AppError('INVALID_INPUT', copy.tooMany)
  const { data, error } = await db.rpc('admin_switch_template_profiles', {
    p_actor: actor, p_ids: ids, p_target: target, p_reason: reason, p_validate_only: validateOnly,
  })
  if (error) {
    if (error.message === 'NOT_ADMIN') throw new AppError('FORBIDDEN', copy.forbidden)
    if (error.message === 'BATCH_TOO_LARGE') throw new AppError('INVALID_INPUT', copy.tooMany)
    if (error.message === 'INVALID_INPUT') throw new AppError('INVALID_INPUT', copy.switchInvalid)
    throw new AppError('INTERNAL', 'admin_switch_template_profiles failed', { cause: error })
  }
  const rows = reportSchema.parse(data).map(row => row.ok ? row : { ...row, detail: switchErrorText(row.code, row.detail) })
  if (!validateOnly) {
    logger.info('admin.template_profile.switched', {
      adminId: actor, target, scope: scope.kind, switched: rows.filter(row => row.ok && !row.unchanged).length,
      skipped: rows.filter(row => !row.ok).length,
    })
  }
  return rows
}

export async function readProfileDrift(db: SupabaseClient): Promise<DriftRow[]> {
  const { data, error } = await db.rpc('admin_template_profile_drift')
  if (error) {
    logger.warn('admin.template_profile.drift_unread', { error })
    return []
  }
  return z.array(z.object({ template_id: z.string(), profile: profileKey, problem: z.string() })).parse(data)
    .map(row => ({ templateId: row.template_id, profile: row.profile, problem: row.problem }))
}
