import 'server-only'

import { randomUUID } from 'node:crypto'

import type { ServerTrack } from '../analytics'
import { tierForBatch, type TierLimits } from '../billing/tier-limits'
import { AppError, TierRequiredError } from '../errors'
import { screenIdentityText, type IdentityJudge, type ScreenResult } from '../identity-guard'
import { isOwnInputKey, loadInputImage, outputKeyFor, writeInputPreview } from '../storage'
import {
  DEFAULT_RESOLUTION,
  loadGenerationTemplate,
  OUTPUT_ASPECTS,
  renderPrompt,
  validateGenerationInputs,
  type GenerationInputs,
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
import { settleGeneration, type DecisionCost, type SettleDeps } from './settle-generation'
import { recordJobClientIp } from './job-download'
import { reserveJob } from './settlement'

// `track` is injectable so tests can assert the `generate` event without PostHog.
// `identityJudge`: the text-only decision call of ARCHITECTURE §5.1a; null or absent means the
// keyword list alone screens the user's words.
export type GenerationDeps = SettleDeps & {
  now?: () => Date
  track?: ServerTrack
  identityJudge?: IdentityJudge | null
  identityJudgeTimeoutMs?: number
}

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
// ownership, tier limits (batch size, rate limit), then the user's words (ARCHITECTURE §5.1a:
// no face swap) alongside the stored upload itself (HEAD + bytes; bad ones are deleted).
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
  // In parallel: the decision call usually finishes while the upload is still being read.
  const [screen, image] = await Promise.all([screenWords(deps, req, inputs), req.inputKey ? loadInputImage(deps.store, req.inputKey) : null])
  return { template, prompt, inputs, image, screen }
}

// Every word the user typed that reaches the image model: the template's text fields and the
// note (the partner's freeform prompt is its `prompt` text field). Templates' own prompts never.
function screenWords(deps: GenerationDeps, req: GenerationRequest, inputs: GenerationInputs) {
  return screenIdentityText(deps, {
    userId: req.userId,
    entry: req.source === 'graylum' ? 'partner' : 'workspace',
    texts: [...Object.values(inputs.copy), inputs.note],
    locale: req.locale,
  })
}

type Prepared = Awaited<ReturnType<typeof prepare>>

// The screening call's tokens join the job's usage and cost like the edit decision's (T33).
function screenCost(deps: GenerationDeps, screen: ScreenResult): DecisionCost | undefined {
  if (!screen.usage) return undefined
  return {
    usage: { decision_input_tokens: screen.usage.inputTokens, decision_output_tokens: screen.usage.outputTokens },
    prices: deps.identityJudge?.prices ?? null,
  }
}

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

// What reserve_credits takes straight from the request.
function reserveFields(req: GenerationRequest) {
  return {
    userId: req.userId,
    source: req.source,
    idempotencyKey: req.idempotencyKey ?? null,
    visibility: req.visibility ?? null,
  }
}

// ARCHITECTURE §8 「原图小图」 (T32), only once the result is confirmed: a failed job has no photo
// page. Edits (T30) settle elsewhere and get none; their source is the work they edited. (The
// upload itself is copied next to the result during settle, T40.)
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
  const job = await reserveJob(deps.db, { ...reserveFields(req), jobId, module: template.module, templateId: template.id, provider: deps.provider.id, inputs: jobInputs(req, prepared, resolution, attemptId) })
  if (job.inputs.attempt_id !== attemptId) return toJobView(job)
  // Dispute evidence (T82): the IP that started this paid or free work.
  await recordJobClientIp(deps.db, { userId: req.userId, jobId: job.id, ip: req.clientIp })

  const call = {
    prompt: renderPrompt(prompt.body, inputs),
    images: image ? [image] : [],
    aspectRatio: inputs.aspectRatio,
    resolution,
    quality: template.quality,
    params: prompt.modelParams,
  }
  const settle = () =>
    settleGeneration(deps, job, call, outputKeyFor(req.userId, job.id), {
      inputKeys: req.inputKey ? [req.inputKey] : [],
      decision: screenCost(deps, prepared.screen),
    })
  const settled = await settleTracked(job, template.category, settle, {
    track: deps.track,
    batchSize: req.batchSize ?? 1,
    locale: req.locale,
  })
  await keepInputPreview(deps, settled, image)
  return toJobView(settled)
}
