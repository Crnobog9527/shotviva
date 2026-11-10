import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError } from '@/core/errors'
import { input, matrixInput, quoteInput } from './contracts'
import { labImageRoute } from './image-route'
import { planMatrix } from './plan-matrix'
import { labRpc } from '@/core/admin/prompt-lab/commands'

const reserved = z.array(z.object({ id: z.uuid(), photo_id: z.uuid(), version_id: z.uuid(), status: z.string() }))

export async function quoteLabMatrix(db: SupabaseClient, raw: unknown) {
  const selection = input(quoteInput, raw)
  const { estimate } = await labImageRoute(db, selection)
  const { cells, estimateUsd } = planMatrix(selection, estimate)
  return { count: cells.length, estimateUsd, estimatePerCellUsd: estimate }
}

export async function reserveLabMatrix(db: SupabaseClient, actor: string, raw: unknown) {
  const p = input(matrixInput, raw)
  const { provider, estimate } = await labImageRoute(db, p)
  if (planMatrix(p, estimate).estimateUsd !== p.expectedEstimateUsd) {
    throw new AppError('CONFLICT', '预计费用已更新，请重新查看报价')
  }
  const rows = await labRpc(db, 'admin_begin_prompt_lab_matrix', {
    p_actor: actor, p_session_id: p.sessionId, p_batch_id: p.batchId, p_photos: p.photoIds, p_versions: p.versionIds,
    p_model: provider.id, p_resolution: p.resolution, p_quality: p.quality, p_use_style_reference: p.useStyleReference,
    p_estimate_usd: estimate,
  }, reserved)
  return { cells: rows.map(r => ({ id: r.id, photoId: r.photo_id, versionId: r.version_id, status: r.status })) }
}
