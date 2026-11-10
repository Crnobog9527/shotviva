import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

import { serverEnv } from '../../env'
import { AppError } from '../../errors'
import type { GenerationRequest } from '../generation-request'

export const cellSchema = z.object({
  position: z.int().positive(),
  photo_name: z.string().min(1).max(255),
  template_name: z.string().min(1),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
})
type Cell = Omit<z.infer<typeof cellSchema>, 'signature'>

function sorted(values: Record<string, unknown> = {}) {
  return Object.keys(values).sort().map(key => [key, values[key]])
}

export function signCell(req: GenerationRequest, cell: Cell) {
  const secret = serverEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new AppError('INTERNAL', 'Batch signing unavailable')
  const payload = [req.userId, req.batchId, req.batchSize, req.batchTemplates, cell.position, cell.photo_name,
    cell.template_name, req.templateId, req.inputKey, req.expectedCredits, req.resolution ?? '1k', req.aspectRatio,
    sorted(req.toggles), [...(req.togglesConfirmed ?? [])].sort(), sorted(req.copy), req.note]
  return createHmac('sha256', secret).update('shotviva.batch.cell.v1\0').update(JSON.stringify(payload)).digest('hex')
}

export function assertBatchProof(req: GenerationRequest) {
  if (!req.batchId && !req.batchCell && (req.batchTemplates ?? 1) === 1) return
  const cell = req.batchCell
  if (!req.batchId || !cell || !timingSafeEqual(Buffer.from(signCell(req, cell)), Buffer.from(cell.signature))) {
    throw new AppError('INVALID_INPUT', 'Run batch preflight again')
  }
}

export function batchInputs(req: GenerationRequest) {
  const cell = req.batchCell
  if (!cell) return (req.batchSize ?? 1) > 1 ? { batch_size: req.batchSize } : {}
  return { batch_id: req.batchId, batch_position: cell.position, batch_photo_name: cell.photo_name,
    batch_expected_credits: req.expectedCredits, batch_template_name: cell.template_name, batch_size: req.batchSize, batch_templates: req.batchTemplates }
}
