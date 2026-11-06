import 'server-only'

import { randomUUID } from 'node:crypto'

import type { ServerTrack } from '../analytics'
import { tierForBatch, type TierLimits } from '../billing/tier-limits'
import { AppError, TierRequiredError } from '../errors'
import { isOwnInputKey, loadInputImage, outputKeyFor, writeInputPreview } from '../storage'
import {
  DEFAULT_RESOLUTION,
  loadGenerationTemplate,
  OUTPUT_ASPECTS,
  renderPrompt,
  validateGenerationInputs,
  type Resolution,
  type TemplateSurface,
} from '../templates'
import { settleTracked } from './generation-analytics'
import type { GenerationRequest } from './generation-request'
import { findOwnJob } from './job-lookup'
import type { Job, JobSource } from './job-schema'
import { toJobView, type JobView } from './job-view'
import { accountLimits } from './account-limits'
import { assertWithinRateLimit } from './rate-limit'
import { settleGeneration, type SettleDeps } from './settle-generation'
import { reserveJob } from './settlement'

// `track` is injectable so tests can assert the `generate` event without PostHog.
export type GenerationDeps = SettleDeps & { now?: () => Date; track?: ServerTrack }

const SURFACE: Record<JobSource, TemplateSurface> = { web: 'web', graylum: 'partner' }

// The web offers the eight output sizes; the partner route keeps each template's own ratios
// (undefined → template.fields.aspectRatios), as its published contract says.
const ASPECTS: Record<JobSource, readonly string[] | undefined> = { web: OUTPUT_ASPECTS, graylum: undefined }

// A batch bigger than the tier holds (Starter 1, Pro 10, Max 30) is refused per photo; the
// browser only offers batchMax, so this is someone bypassing the picker or a tier that lapsed
// mid-batch. Credits, perWindow and concurrency still bound everything else (§6.2).
function assertBatchAllowed(limits: TierLimits, batchSize: number) {
  if (batchSize <= limits.batchMax) return
  const required = tierForBatch(batchSize) ?? 'max'
  throw new TierRequiredError(required, `A batch of ${batchSize} photos needs a higher plan`)
}

// Everything that can be rejected without touching credits: template, fields, key
// ownership, tier limits (batch size, rate limit), then the stored upload itself (HEAD +
// bytes; bad ones are deleted).
async function prepare(deps: GenerationDeps, req: GenerationRequest) {
  const { template, prompt } = await loadGenerationTemplate(deps.db, req.templateId, SURFACE[req.source])
  const inputs = validateGenerationInputs(template.fields, {
    copy: req.copy,
    aspectRatio: req.aspectRatio,
    note: req.note,
    imageCount: req.inputKey ? 1 : 0,
    aspects: ASPECTS[req.source],
  })
  // Never touch (or delete) an object outside the caller's own inputs/ prefix.
  if (req.inputKey && !isOwnInputKey(req.userId, req.inputKey)) throw new AppError('INVALID_INPUT', 'Unknown upload')
  const limits = await accountLimits(deps.db, req.userId)
  assertBatchAllowed(limits, req.batchSize ?? 1)
  await assertWithinRateLimit(deps.db, req.userId, deps.now?.() ?? new Date(), limits, {
    jobId: req.jobId,
    idempotencyKey: req.idempotencyKey,
  })
  const image = req.inputKey ? await loadInputImage(deps.store, req.inputKey) : null
  return { template, prompt, inputs, image }
}

type Prepared = Awaited<ReturnType<typeof prepare>>

// User content only; the wrapped prompt stays in template_prompts (ARCHITECTURE §4).
// reserve_credits charges templates.credits_cost[resolution] from this very object.
function jobInputs(req: GenerationRequest, { inputs, prompt }: Prepared, resolution: Resolution, attemptId: string) {
  return {
    copy: inputs.copy,
    aspect_ratio: inputs.aspectRatio,
    resolution,
    ...(inputs.note ? { note: inputs.note } : {}),
    input_key: req.inputKey ?? null,
    prompt_version: prompt.version,
    attempt_id: attemptId,
  }
}

// ARCHITECTURE §8 「原图小图」 (T32), only once the result is confirmed: a failed job has no
// photo page. Edits (T30) settle elsewhere and get none; their source is the work they edited.
async function keepInputPreview(deps: GenerationDeps, job: Job, image: Prepared['image']) {
  if (image) await writeInputPreview(deps.store, { userId: job.userId, jobId: job.id, bytes: image.bytes })
}

// Synchronous generation (ARCHITECTURE §4) shared by the web route and, later, the partner
// route. Returns the settled job; failures after reservation throw GenerationFailure with
// the credits already refunded. The response never carries image bytes.
export async function runGeneration(deps: GenerationDeps, req: GenerationRequest): Promise<JobView> {
  if (req.jobId) {
    const existing = await findOwnJob(deps.db, req.userId, req.jobId)
    if (existing) return toJobView(existing)
  }
  const prepared = await prepare(deps, req)
  const { template, prompt, inputs, image } = prepared

  const jobId = req.jobId ?? randomUUID()
  const resolution = req.resolution ?? DEFAULT_RESOLUTION
  // Marks which request created the row: two concurrent requests with one job id both get
  // the row back from reserve_credits (charged once), but only the creator calls the provider.
  const attemptId = randomUUID()
  const job = await reserveJob(deps.db, {
    jobId,
    userId: req.userId,
    module: template.module,
    templateId: template.id,
    source: req.source,
    provider: deps.provider.id,
    idempotencyKey: req.idempotencyKey ?? null,
    visibility: req.visibility ?? null,
    inputs: jobInputs(req, prepared, resolution, attemptId),
  })
  if (job.inputs.attempt_id !== attemptId) return toJobView(job)

  const call = {
    prompt: renderPrompt(prompt.body, inputs),
    images: image ? [image] : [],
    aspectRatio: inputs.aspectRatio,
    resolution,
    quality: template.quality,
    params: prompt.modelParams,
  }
  const settle = () => settleGeneration(deps, job, call, outputKeyFor(req.userId, job.id))
  const settled = await settleTracked(job, template.category, settle, { track: deps.track, batchSize: req.batchSize ?? 1 })
  await keepInputPreview(deps, settled, image)
  return toJobView(settled)
}
