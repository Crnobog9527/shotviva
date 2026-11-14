import 'server-only'

import type { z } from 'zod'

import { AppError } from '../errors'
import { findJobByIdempotencyKey, GenerationFailure, runGeneration, type GenerationDeps, type Job } from '../jobs'
import { newInputKey, outputKeyFor } from '../storage'
import { fetchPartnerImage, type FetchLike } from './fetch-image'
import type { generateRequestSchema } from './partner-types'
import { partnerFailureCode } from './partner-views'

export type PartnerGenerateDeps = GenerationDeps & { fetch?: FetchLike; imageHosts: readonly string[] }

export type PartnerGenerateRequest = {
  userId: string
  idempotencyKey: string
  body: z.infer<typeof generateRequestSchema>
}

export type PartnerGenerateOutcome = Pick<Job, 'id' | 'status' | 'creditsCost' | 'outputKey'>

// A replayed key whose job failed answers with that failure again (already refunded).
function replayFailure(job: Job): GenerationFailure {
  if (job.errorCode === 'REFERENCE_IMAGE_LIMIT' || job.errorCode === 'MODEL_INPUT_UNSUPPORTED') {
    const message = job.errorCode === 'REFERENCE_IMAGE_LIMIT'
      ? 'This request exceeds the image model’s reference image limit.'
      : 'This image model does not support the requested inputs.'
    return new GenerationFailure(new AppError(job.errorCode, message), job.id, true)
  }
  const code = partnerFailureCode(job.errorCode)
  const source =
    code === 'content_rejected'
      ? new AppError('CONTENT_REJECTED', 'This photo or text was declined by the image model')
      : new AppError('GENERATION_FAILED', 'Generation failed')
  return new GenerationFailure(source, job.id, true)
}

// The partner image goes through the same inputs/{user}/ object and HEAD/decode gate as a web
// upload, so runGeneration needs no partner-specific path.
async function storePartnerImage(deps: PartnerGenerateDeps, userId: string, image: string): Promise<string> {
  const bytes = await fetchPartnerImage(image, { hosts: deps.imageHosts, fetch: deps.fetch })
  const key = newInputKey(userId, 'image/jpeg')
  await deps.store.put(key, bytes, 'image/jpeg')
  return key
}

// POST /api/partner/generate (ARCHITECTURE §14.4): the web's reserve/confirm/refund path with
// source 'graylum'. The Idempotency-Key is checked first, so a replay neither refetches the
// image nor charges again; it answers with the first job as it stands now.
export async function partnerGenerate(deps: PartnerGenerateDeps, req: PartnerGenerateRequest): Promise<PartnerGenerateOutcome> {
  const existing = await findJobByIdempotencyKey(deps.db, req.userId, req.idempotencyKey)
  if (existing) {
    if (existing.status === 'failed') throw replayFailure(existing)
    return existing
  }

  const inputKey = req.body.image ? await storePartnerImage(deps, req.userId, req.body.image) : null
  const view = await runGeneration(deps, {
    userId: req.userId,
    source: 'graylum',
    templateId: req.body.template_id,
    expectedCredits: req.body.expected_credits,
    inputKey,
    copy: req.body.inputs.copy,
    aspectRatio: req.body.inputs.aspect_ratio,
    idempotencyKey: req.idempotencyKey,
  })
  // A concurrent request with the same key may have created the job; it settles it.
  if (view.status === 'failed') throw replayFailure(await mustFind(deps, req))
  return {
    id: view.id,
    status: view.status,
    creditsCost: view.credits_cost,
    outputKey: view.status === 'succeeded' ? outputKeyFor(req.userId, view.id) : null,
  }
}

async function mustFind(deps: PartnerGenerateDeps, req: PartnerGenerateRequest): Promise<Job> {
  const job = await findJobByIdempotencyKey(deps.db, req.userId, req.idempotencyKey)
  if (!job) throw new AppError('INTERNAL', 'partner job vanished')
  return job
}
