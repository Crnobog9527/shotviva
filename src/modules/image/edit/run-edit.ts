import 'server-only'

import { randomUUID } from 'node:crypto'

import type { ServerTrack } from '@/core/analytics'
import { AppError } from '@/core/errors'
import {
  accountLimits,
  assertWithinRateLimit,
  findOwnJob,
  recordJobClientIp,
  reserveJob,
  settleGeneration,
  settleTracked,
  toJobView,
  type Job,
  type JobView,
  type SettleDeps,
} from '@/core/jobs'
import { loadOutputImage, outputKeyFor } from '@/core/storage'
import { assertPricedTier, assertTemplateQuote, allowedWebAspects, DEFAULT_RESOLUTION, instructionSchema, RESOLUTIONS, type Resolution } from '@/core/templates'

import type { ScopeClassifier } from './classifier'
import type { EditClassification } from './classify-scope'
import type { EditRequest } from './edit-request'
import { decideEdit, editDecisionCost, editProviderCall, editRecord, loadEditPipeline } from './edit-pipeline'

// A photo edit (ARCHITECTURE §5.2): one ordinary generation on the built-in `edit` template whose
// input is the caller's own finished work, read server-side from R2. Charging, refunds, the
// watermark rule and the `generate` event are exactly those of a template generation.
export type EditDeps = SettleDeps & {
  classifier: ScopeClassifier | null
  now?: () => Date
  track?: ServerTrack
  classifierTimeoutMs?: number
}

// A fixed width:height ratio is kept as asked; 'original' (or a pre-T16 job) follows the pixels.
function sourceAspect(source: Job): string {
  const aspect = source.inputs.aspect_ratio
  return typeof aspect === 'string' && /^\d{1,2}:\d{1,2}$/.test(aspect) ? aspect : 'original'
}

function sourceResolution(source: Job): Resolution {
  const tier = source.inputs.resolution
  return RESOLUTIONS.find((r) => r === tier) ?? DEFAULT_RESOLUTION
}

// Everything that can be refused before any credit moves. The database checks ownership again.
async function prepare(deps: EditDeps, req: EditRequest) {
  const instruction = instructionSchema.safeParse(req.instruction)
  if (!instruction.success) throw new AppError('INVALID_INPUT', 'Say what to change in 1–500 characters')
  const source = await findOwnJob(deps.db, req.userId, req.sourceJobId)
  if (!source || source.status !== 'succeeded' || !source.outputKey) throw new AppError('NOT_FOUND', 'Photo not found')
  const pipeline = await loadEditPipeline(deps.db)
  const aspect = req.aspect ?? sourceAspect(source)
  const resolution = req.resolution ?? sourceResolution(source)
  assertPricedTier(pipeline.template.unpricedResolutions, resolution)
  assertTemplateQuote(req.expectedCredits, pipeline.template.creditsCost[resolution])
  if (!allowedWebAspects(pipeline.template.imageOptions, resolution).includes(aspect)) {
    throw new AppError('INVALID_INPUT', 'Unsupported edit aspect ratio')
  }
  const limits = await accountLimits(deps.db, req.userId)
  await assertWithinRateLimit(deps.db, req.userId, deps.now?.() ?? new Date(), limits, { jobId: req.jobId })
  const image = await loadOutputImage(deps.store, source.outputKey)
  // The size asked for (T47: the panel offers the eight), else the work's own; another size
  // than the work's ends the prompt with the reframe paragraph.
  const reframed = aspect !== sourceAspect(source)
  return { instruction: instruction.data, source, pipeline, image, aspect, reframed }
}

type Prepared = Awaited<ReturnType<typeof prepare>>

// User content and the classifier's answer only (ARCHITECTURE §5.2); the wrapper, classifier
// instructions and paragraphs stay in template_prompts. The classifier's tokens are not user
// content: they go to provider_usage and cost_usd with the image call's (editDecisionCost).
function jobInputs(p: Prepared, decision: EditClassification, resolution: Resolution, attemptId: string) {
  return {
    ...editRecord(decision, p.instruction),
    aspect_ratio: p.aspect,
    quality: p.pipeline.template.quality,
    resolution,
    input_key: null,
    prompt_version: p.pipeline.prompt.version,
    attempt_id: attemptId,
  }
}

export async function runEdit(deps: EditDeps, req: EditRequest): Promise<JobView> {
  if (req.jobId) {
    const existing = await findOwnJob(deps.db, req.userId, req.jobId)
    if (existing) return toJobView(existing)
  }
  const prepared = await prepare(deps, req)
  const decision = await decideEdit(deps, { userId: req.userId, pipeline: prepared.pipeline, image: prepared.image, instruction: prepared.instruction })
  const resolution = req.resolution ?? sourceResolution(prepared.source)
  const attemptId = randomUUID()
  const job = await reserveJob(deps.db, {
    jobId: req.jobId ?? randomUUID(),
    userId: req.userId,
    module: prepared.pipeline.template.module,
    templateId: prepared.pipeline.template.id,
    expectedCredits: req.expectedCredits,
    source: 'web',
    provider: deps.provider.id,
    parentJobId: prepared.source.id,
    inputs: jobInputs(prepared, decision, resolution, attemptId),
  })
  // Two concurrent requests with one job id: only the one that created the row calls the model.
  if (job.inputs.attempt_id !== attemptId) return toJobView(job)
  // Dispute evidence (T82): the IP that started this edit.
  await recordJobClientIp(deps.db, { userId: req.userId, jobId: job.id, ip: req.clientIp })

  const call = editProviderCall(prepared.pipeline, decision, { image: prepared.image, instruction: prepared.instruction, aspect: prepared.aspect, reframed: prepared.reframed, resolution })
  const settle = () => settleGeneration(deps, job, call, outputKeyFor(req.userId, job.id), { decision: editDecisionCost(deps.classifier, decision) })
  return toJobView(await settleTracked(job, prepared.pipeline.template.category, settle, { track: deps.track }))
}
