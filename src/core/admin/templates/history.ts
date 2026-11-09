import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError } from '@/core/errors'
import type { PromptSnapshot } from './types'
import { templateInputSchema } from '@/core/templates/schema'
import type { StyleRef } from '@/core/templates/style-refs'

const id = templateInputSchema.shape.id
const version = z.int().positive()
const list = z.object({ id, before: version.optional() })
const detail = z.object({ id, version })

export async function listVersions(db: SupabaseClient, input: unknown) {
  const args = list.parse(input)
  const query = db.from('template_prompt_versions').select('version').eq('template_id', args.id)
  if (args.before !== undefined) query.lt('version', args.before)
  const { data, error } = await query.order('version', { ascending: false }).limit(30).returns<{ version: number }[]>()
  if (error) throw new AppError('INTERNAL', 'Failed to list prompt versions')
  return data.map(row => row.version)
}

type Row = { body: string; version: number; provider_id: string | null; provider_model: string | null; model_params: Record<string, unknown>; style_refs: StyleRef[] }

export async function readVersion(db: SupabaseClient, input: unknown): Promise<PromptSnapshot> {
  const { id, version } = detail.parse(input)
  const { data, error } = await db.from('template_prompt_versions').select('body,version,model_params,provider_id,provider_model,style_refs')
    .eq('template_id', id).eq('version', version).maybeSingle<Row>()
  if (error || !data) throw new AppError('NOT_FOUND', '找不到这个模板的提示词版本。')
  return { body: data.body, version, providerId: data.provider_id, providerModel: data.provider_model, modelParams: data.model_params, styleRefs: data.style_refs }
}
