import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { styleRefsSchema, type StyleRef } from '@/core/templates/style-refs'
import type { Resolution } from '@/core/templates/output-options'
import type { ProviderFloors } from '@/core/templates/provider-pricing'
import { AppError, type ErrorCode } from '@/core/errors'
import {
  coverLocalesSchema,
  EDIT_TEMPLATE_ID,
  PRE_T75_TEMPLATE_COLUMNS,
  selectTemplates,
  toTemplate,
  type PreT75TemplateRow,
  type PromptInput,
  type TemplateInput,
  type TemplateRow,
} from '@/core/templates'

import type { PublishCandidate } from './publish-rules'
import { toUpsertArgs } from './rpc-payload'
import type { AdminTemplate, SaveTemplatePayload, TemplateOrderGroup } from './types'

// Every function expects a service-role client; callers must have passed requireAdmin().

type PromptRow = { style_refs: StyleRef[]; provider_id: string | null; body: string; version: number; model_params: Record<string, unknown> }
type SaleRow = { template_sale_approvals: { enabled: boolean; unpriced_resolutions: Resolution[] } | null }
type AdminRow = SaleRow & { subcategory_key: string | null; series_id: string | null; series_sort_order: number } & (TemplateRow | PreT75TemplateRow) & { template_prompts: PromptRow | null }

const CATALOGUE_PAGE_SIZE = 250

async function readAdminPage(client: SupabaseClient, after: string | null) {
  const { data, error } = await selectTemplates((columns) => {
    // The stable primary-key cursor keeps an in-flight reorder from skipping a template.
    const taxonomy = columns.startsWith(PRE_T75_TEMPLATE_COLUMNS + ',') ? '' : ', subcategory_key, series_id, series_sort_order'
    const page = client.from('templates').select(columns + taxonomy).neq('id', EDIT_TEMPLATE_ID)
      .order('id').limit(CATALOGUE_PAGE_SIZE)
    if (after) page.gt('id', after)
    return page.returns<AdminRow[]>()
  }, ', template_sale_approvals(enabled,unpriced_resolutions), template_prompts(body, version, model_params, provider_id, style_refs)')
  if (error || !data) throw new AppError('INTERNAL', `listAdminTemplates failed: ${error?.message ?? 'no data'}`)
  return data
}

export async function listAdminTemplates(client: SupabaseClient): Promise<AdminTemplate[]> {
  const rows: AdminRow[] = []
  let after: string | null = null
  while (true) {
    const page = await readAdminPage(client, after)
    rows.push(...page)
    if (page.length < CATALOGUE_PAGE_SIZE) break
    after = page[page.length - 1].id
  }
  // Stable sort preserves the database id order within each rank.
  const data = rows.sort((a, b) => a.sort_order - b.sort_order)
  return data.map((row) => ({
    ...toTemplate(row),
    subcategoryKey: row.subcategory_key,
    seriesId: row.series_id,
    seriesSortOrder: row.series_sort_order,
    saleEnabled: row.template_sale_approvals?.enabled === true,
    unpricedResolutions: row.template_sale_approvals?.unpriced_resolutions,
    prompt: row.template_prompts
      ? {
          styleRefs: styleRefsSchema.parse(row.template_prompts.style_refs),
          providerId: row.template_prompts.provider_id,
          body: row.template_prompts.body,
          version: row.template_prompts.version,
          modelParams: row.template_prompts.model_params,
        }
      : null,
  }))
}

// A plain GET, not `head: true`: PostgREST answers HEAD without Content-Length and then
// closes the connection, and Kong reuses that dead connection for the next request. The
// POST that follows here (admin_upsert_template) then fails with a 502 (see eslint config).
export async function templateExists(client: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await client.from('templates').select('id').eq('id', id).limit(1)
  if (error) throw new AppError('INTERNAL', `templateExists failed: ${error.message}`)
  return data.length > 0
}

const versionErrors: Record<string, string> = {
  STALE_TEMPLATE_ASSIGNMENT: '分类或系列已被其他管理员更改。请重新打开模板核对。',
  SYSTEM_ASSIGNMENT: '内置模板的分类与系列不能更改。',
  SERIES_NOT_FOUND: '所选系列已不存在，请重新选择。',
  CATEGORY_NOT_FOUND: '所选分类已不存在，请重新选择。',
  TEMPLATE_EXISTS: '模板 ID 已被使用，请更换。',
  STALE_PROMPT: '已有其他人修改了提示词。请保留草稿，再重新打开模板核对。',
  VERSION_NOT_FOUND: '这个模板没有所选版本。',
  HISTORICAL_PROVIDER_UNAVAILABLE: '历史版本的供应商或密钥已不可用，或绑定模型已变更。当前配置未改变。',
}

export async function upsertTemplate(
  client: SupabaseClient,
  template: TemplateInput,
  prompt: PromptInput,
  floors?: ProviderFloors,
  revision?: { actor: string; expected: number; selected?: number },
): Promise<number | undefined> {
  const args = toUpsertArgs(template, prompt, { floors })
  const { data, error } = revision
    ? await client.rpc('admin_save_versioned_template', { ...args, p_actor: revision.actor, p_expected: revision.expected, p_selected: revision.selected ?? null })
    : await client.rpc('admin_upsert_template', args)
  if (!error) return revision ? Number(data) : undefined
  throwTemplateError(error)
}

function throwTemplateError(error: { code: string; message: string; details: string }): never {
  if (error.message === 'TEMPLATE_NOT_FOUND') throw new AppError('NOT_FOUND', '模板已不存在，请刷新。')
  if (error.message === 'NOT_ADMIN') throw new AppError('FORBIDDEN', '需要管理员权限。')
  const message = versionErrors[error.message]
  if (message) throw new AppError('INVALID_INPUT', message)
  if (['MODEL_REFERENCE_LIMIT', 'MODEL_CREDIT_FLOOR', 'TEMPLATE_RETIRED', 'TEMPLATE_PRICE_BELOW_FLOOR'].includes(error.message)) throw new AppError('INVALID_INPUT', error.details)
  if (error.message === 'MODEL_CHANGED') throw new AppError('INVALID_INPUT', '出图供应商有变化，请刷新后重新保存')
  if (error.message.includes('PROVIDER_NOT_IMAGE')) throw new AppError('INVALID_INPUT', '所选出图模型已不可用，请重新选择')
  // templates_category_key_fkey (T75): the category was deleted while the form was open.
  if (error.code === '23503') throw new AppError('INVALID_INPUT', '所选分类已经不存在了，请重新选择分类')
  throw new AppError('INTERNAL', `upsertTemplate failed: ${error.message}`)
}

// The assignment and the original prompt/price save commit together.
export async function saveAssignedTemplate(client: SupabaseClient, template: TemplateInput, prompt: PromptInput,
  floors: ProviderFloors, opts: {
    actor: string; isNew: boolean; assignment: NonNullable<SaveTemplatePayload['assignment']>; revision?: SaveTemplatePayload['revision']
  }): Promise<number | undefined> {
  const { assignment, revision } = opts
  const { data, error } = await client.rpc('admin_save_template_assignment', {
    ...toUpsertArgs(template, prompt, { floors }), p_actor: opts.actor, p_is_new: opts.isNew,
    p_assignment: { series_id: assignment.seriesId, previous_category: assignment.previousCategory, previous_series_id: assignment.previousSeriesId },
    p_expected: revision?.expected, p_selected: revision?.selected,
  })
  if (error) throwTemplateError(error)
  return data == null ? undefined : Number(data)
}

type CandidateRow = SaleRow & Pick<
  TemplateRow,
  'id' | 'name' | 'category_key' | 'description' | 'visible_in' | 'cover_before_url' | 'cover_after_url' | 'cover_locales' | 'quality' | 'credits_cost' | 'is_active'
> & { template_prompts: { version: number; provider_id: string | null } | null }

// Only what the publish rules read (T60); one query for the whole batch, by primary key.
export async function loadPublishCandidates(client: SupabaseClient, ids: readonly string[]): Promise<PublishCandidate[]> {
  const { data, error } = await client
    .from('templates')
    .select('id, name, category_key, description, visible_in, cover_before_url, cover_after_url, cover_locales, quality, credits_cost, is_active, template_sale_approvals(enabled,unpriced_resolutions), template_prompts(version, provider_id)')
    .in('id', ids)
    .returns<CandidateRow[]>()
  if (error) throw new AppError('INTERNAL', `loadPublishCandidates failed: ${error.message}`)
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    visibleIn: row.visible_in,
    coverBeforeUrl: row.cover_before_url,
    coverAfterUrl: row.cover_after_url,
    // A launched language's own complete set also counts (T87).
    coverLocales: coverLocalesSchema.parse(row.cover_locales ?? {}),
    quality: row.quality,
    creditsCost: row.credits_cost,
    isActive: row.is_active,
    saleEnabled: row.template_sale_approvals?.enabled === true,
    unpricedResolutions: row.template_sale_approvals?.unpriced_resolutions ?? [],
    hasPrompt: row.template_prompts !== null,
    category: row.category_key,
    providerId: row.template_prompts?.provider_id,
  }))
}

// One update for the batch (primary-key filter).
export async function setTemplatesActive(client: SupabaseClient, ids: readonly string[], active: boolean): Promise<void> {
  // An unpublished template cannot stay featured (T53, templates_featured_live_check).
  const { error } = await client
    .from('templates')
    .update(active ? { is_active: true } : { is_active: false, featured_rank: null })
    .in('id', ids)
  if (error && ['TEMPLATE_RETIRED', 'TEMPLATE_PRICE_BELOW_FLOOR'].includes(error.message)) throw new AppError('INVALID_INPUT', error.details)
  if (error) throw new AppError('INTERNAL', `setTemplatesActive failed: ${error.message}`)
}

// The home featured list in display order (T53); the SQL function checks the rules.
export async function setFeaturedTemplates(client: SupabaseClient, ids: string[]): Promise<void> {
  const { error } = await client.rpc('admin_set_featured_templates', { p_ids: ids })
  if (error) {
    if (error.code === '22023') throw new AppError('INVALID_INPUT', error.message)
    throw new AppError('INTERNAL', `setFeaturedTemplates failed: ${error.message}`)
  }
}

// What the admin sees when admin_set_template_order refuses (0600); anything else is INTERNAL.
const ORDER_ERRORS: Record<string, [ErrorCode, string]> = {
  ORDER_MISMATCH: ['CONFLICT', '列表在别处改过了（有模板新增、删除、上下架或进出精选），请刷新页面后再排序'],
  NOT_ADMIN: ['FORBIDDEN', '只有管理员能调整顺序'],
  INVALID_INPUT: ['INVALID_INPUT', '顺序没保存：提交的列表不完整，请刷新页面后再试'],
}

// One group's whole order in one call (T76): 'catalogue' rewrites sort_order, 'featured' the
// home featured ranks.
export async function setTemplateOrder(
  client: SupabaseClient,
  group: TemplateOrderGroup,
  ids: string[],
  actor: string,
): Promise<void> {
  const { error } = await client.rpc('admin_set_template_order', { p_group: group, p_ids: ids, p_actor: actor })
  if (!error) return
  const known = ORDER_ERRORS[error.message]
  if (known) throw new AppError(known[0], known[1])
  throw new AppError('INTERNAL', `setTemplateOrder failed: ${error.message}`)
}
