import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError } from '@/core/errors'
import type { PromptSnapshot, VersionSummary } from './types'
import { templateInputSchema } from '@/core/templates/schema'
import type { StyleRef } from '@/core/templates/style-refs'

const id = templateInputSchema.shape.id
const version = z.int().positive()
const list = z.object({ id, before: version.optional() })
const detail = z.object({ id, version })

export async function listVersions(db: SupabaseClient, input: unknown) {
  const args = list.parse(input)
  const query = db.from('template_prompt_versions').select('version,display_name,created_at').eq('template_id', args.id)
  if (args.before !== undefined) query.lt('version', args.before)
  const { data, error } = await query.order('version', { ascending: false }).limit(30).returns<VersionSummary[]>()
  if (error) throw new AppError('INTERNAL', 'Failed to list prompt versions')
  return data
}

type Row = { body: string; version: number; provider_id: string | null; provider_model: string | null; model_params: Record<string, unknown>; style_refs: StyleRef[] }

export async function readVersion(db: SupabaseClient, input: unknown): Promise<PromptSnapshot> {
  const { id, version } = detail.parse(input)
  const { data, error } = await db.from('template_prompt_versions').select('body,version,model_params,provider_id,provider_model,style_refs')
    .eq('template_id', id).eq('version', version).maybeSingle<Row>()
  if (error || !data) throw new AppError('NOT_FOUND', '找不到这个模板的提示词版本。')
  return { body: data.body, version, providerId: data.provider_id, providerModel: data.provider_model, modelParams: data.model_params, styleRefs: data.style_refs }
}

export async function manageVersion(db: SupabaseClient, actor: string, input: unknown) {
  const args = detail.extend({ action: z.enum(['rename','delete']), name: z.string().trim().max(80).optional() }).parse(input)
  const { error } = await db.rpc('admin_manage_prompt_version', {
    p_actor: actor, p_id: args.id, p_version: args.version, p_action: args.action, p_name: args.name ?? null,
  })
  if (!error) return
  if (error.message === 'ACTIVE_VERSION') throw new AppError('INVALID_INPUT', '当前生效的提示词版本不能删除')
  if (error.message === 'VERSION_NOT_FOUND') throw new AppError('NOT_FOUND', '版本已删除，请刷新')
  throw new AppError('INTERNAL', '提示词版本修改失败', { cause: error })
}
