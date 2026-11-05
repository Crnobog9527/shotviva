import 'server-only'

import { randomUUID } from 'node:crypto'

import { AppError } from '../errors'
import { isOwnInputKey, loadInputImage, outputKeyFor } from '../storage'
import { loadGenerationTemplate, renderPrompt, validateGenerationInputs, type TemplateSurface } from '../templates'
import type { GenerationRequest } from './generation-request'
import { findOwnJob } from './job-lookup'
import type { JobSource } from './job-schema'
import { toJobView, type JobView } from './job-view'
import { assertWithinRateLimit } from './rate-limit'
import { settleGeneration, type SettleDeps } from './settle-generation'
import { reserveJob } from './settlement'

export type GenerationDeps = SettleDeps & { now?: () => Date }

const SURFACE: Record<JobSource, TemplateSurface> = { web: 'web', graylum: 'partner' }

// Everything that can be rejected without touching credits: template, fields, key
// ownership, rate limit, then the stored upload itself (HEAD + bytes; bad ones are deleted).
async function prepare(deps: GenerationDeps, req: GenerationRequest) {
  const { template, prompt } = await loadGenerationTemplate(deps.db, req.templateId, SURFACE[req.source])
  const inputs = validateGenerationInputs(template.fields, {
    copy: req.copy,
    aspectRatio: req.aspectRatio,
    imageCount: req.inputKey ? 1 : 0,
  })
  // Never touch (or delete) an object outside the caller's own inputs/ prefix.
  if (req.inputKey && !isOwnInputKey(req.userId, req.inputKey)) throw new AppError('INVALID_INPUT', 'Unknown upload')
  await assertWithinRateLimit(deps.db, req.userId, deps.now?.() ?? new Date())
  const image = req.inputKey ? await loadInputImage(deps.store, req.inputKey) : null
  return { template, prompt, inputs, image }
}

// Synchronous generation (ARCHITECTURE §4) shared by the web route and, later, the partner
// route. Returns the settled job; failures after reservation throw GenerationFailure with
// the credits already refunded. The response never carries image bytes.
export async function runGeneration(deps: GenerationDeps, req: GenerationRequest): Promise<JobView> {
  if (req.jobId) {
    const existing = await findOwnJob(deps.db, req.userId, req.jobId)
    if (existing) return toJobView(existing)
  }
  const { template, prompt, inputs, image } = await prepare(deps, req)

  const jobId = req.jobId ?? randomUUID()
  // Marks which request created the row: two concurrent requests with one job id both get
  // the row back from reserve_credits (charged once), but only the creator calls the provider.
  const attemptId = randomUUID()
  const job = await reserveJob(deps.db, {
    jobId,
    userId: req.userId,
    module: template.module,
    templateId: template.id,
    creditsCost: template.creditsCost,
    source: req.source,
    provider: deps.provider.id,
    idempotencyKey: req.idempotencyKey ?? null,
    visibility: req.visibility ?? null,
    // User content only; the wrapped prompt stays in template_prompts (ARCHITECTURE §4).
    inputs: {
      copy: inputs.copy,
      aspect_ratio: inputs.aspectRatio,
      input_key: req.inputKey ?? null,
      prompt_version: prompt.version,
      attempt_id: attemptId,
    },
  })
  if (job.inputs.attempt_id !== attemptId) return toJobView(job)

  const call = {
    prompt: renderPrompt(prompt.body, inputs),
    images: image ? [image] : [],
    aspectRatio: inputs.aspectRatio,
    params: prompt.modelParams,
  }
  return toJobView(await settleGeneration(deps, job, call, outputKeyFor(req.userId, job.id)))
}
