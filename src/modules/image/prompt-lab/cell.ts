import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { GenerationFailure, settleProviderCall, templateCall, type JobCost } from '@/core/jobs'
import { loadInputImage, type ObjectStore } from '@/core/storage'
import { RESOLUTIONS } from '@/core/templates/output-options'
import { TEMPLATE_QUALITIES } from '@/core/templates/pricing'
import { input, runInput } from './contracts'
import { labImageRoute } from './image-route'
import { labRpc } from '@/core/admin/prompt-lab/commands'
import { storeLabOutput } from './output'
import { styleImage } from './style-image'

const cellSchema = z.object({
  model: z.string(), resolution: z.enum(RESOLUTIONS), quality: z.enum(TEMPLATE_QUALITIES), use_style_reference: z.boolean(),
  estimate_usd: z.number(), status: z.string(),
  admin_test_photos: z.object({ object_key: z.string() }),
  prompt_lab_versions: z.object({ version_no: z.number(), prompt: z.string() }),
  prompt_lab_sessions: z.object({ reference_assets: z.object({
    id: z.uuid(), width: z.number(), height: z.number(), created_at: z.string(),
  }) }),
})
const columns = 'model,resolution,quality,use_style_reference,estimate_usd,status,admin_test_photos(object_key),prompt_lab_versions(version_no,prompt),prompt_lab_sessions(reference_assets(id,width,height,created_at))'
type CellDeps = { db: SupabaseClient; store: ObjectStore }

async function prepareCell(deps: CellDeps, row: z.infer<typeof cellSchema>) {
  const providerId = row.model.split('/')[0]
  const { provider, aspectRatio, estimate } = await labImageRoute(deps.db, {
    providerId, resolution: row.resolution, quality: row.quality, useStyleReference: row.use_style_reference,
  })
  if (provider.id !== row.model || estimate > row.estimate_usd) throw new AppError('CONFLICT', '模型或成本发生变化，请重新创建试跑')
  const photo = await loadInputImage(deps.store, row.admin_test_photos.object_key)
  const asset = row.prompt_lab_sessions.reference_assets
  const styleRefs = row.use_style_reference ? [{
    key: `references/${asset.id}.webp`, width: asset.width, height: asset.height, uploadedAt: asset.created_at,
  }] : []
  const args = await templateCall({ ...deps, provider }, {
    template: { id: asset.id, quality: row.quality },
    prompt: { providerId, modelParams: {}, styleRefs, body: row.prompt_lab_versions.prompt, version: row.prompt_lab_versions.version_no },
  }, { copy: {}, note: '', aspectRatio, toggles: {}, confirmed: [] }, [photo], { providerId, resolution: row.resolution })
  if (args.styleRefKeys.length !== styleRefs.length) throw new AppError('MODEL_INPUT_UNSUPPORTED', '模型无法接收画风参考图')
  if (args.call.images[1]) args.call.images[1] = await styleImage(args.call.images[1])
  return args
}

async function finish(db: SupabaseClient, actor: string, id: string, outputKey: string | null, error: string | null, cost: JobCost) {
  await labRpc(db, 'admin_finish_prompt_lab_run', {
    p_actor: actor, p_run_id: id, p_status: error ? 'failed' : 'succeeded', p_output_key: outputKey, p_error_code: error,
    p_provider_usage: cost.usage ?? null, p_cost_usd: cost.costUsd ?? null,
  }, z.unknown())
}

async function currentCell(db: SupabaseClient, id: string) {
  const { data, error } = await db.from('prompt_lab_runs').select('status').eq('id', id).maybeSingle()
  if (error) throw new AppError('INTERNAL', '无法确认试跑状态')
  if (!data) throw new AppError('NOT_FOUND', '试跑记录不存在')
  return { id, status: data.status as string }
}

export async function executeLabCell(deps: CellDeps, actor: string, raw: unknown) {
  const { runId: id } = input(runInput, raw)
  const claimed = await labRpc(deps.db, 'admin_claim_prompt_lab_run', { p_actor: actor, p_run_id: id }, z.boolean())
  if (!claimed) return currentCell(deps.db, id)
  let prepared
  try {
    const { data, error } = await deps.db.from('prompt_lab_runs').select(columns).eq('id', id).single()
    const row = cellSchema.safeParse(data)
    if (error || !row.success) throw new AppError('INVALID_INPUT', '无法读取试跑输入')
    prepared = await prepareCell(deps, row.data)
  } catch {
    await finish(deps.db, actor, id, null, 'PREPARE_FAILED', {})
    return { id, status: 'failed' }
  }
  const key = `prompt-lab/outputs/${id}.png`
  try {
    await settleProviderCall({ ...deps, provider: prepared.provider }, {
      id, source: 'admin_test', alerts: false,
      store: output => storeLabOutput(deps.store, key, output.bytes),
      confirm: (_, cost) => finish(deps.db, actor, id, key, null, cost),
      fail: async (code, cost) => { await finish(deps.db, actor, id, null, code, cost); return true },
    }, prepared.call)
  } catch (error) {
    if (!(error instanceof GenerationFailure)) throw error
    // A lost confirm reply may already have committed a successful result.
    return currentCell(deps.db, id)
  }
  return { id, status: 'succeeded' }
}
