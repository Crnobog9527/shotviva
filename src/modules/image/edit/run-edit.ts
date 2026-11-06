import 'server-only'

import { randomUUID } from 'node:crypto'

import type { ServerTrack } from '@/core/analytics'
import { AppError } from '@/core/errors'
import {
  assertWithinRateLimit,
  findOwnJob,
  reserveJob,
  settleGeneration,
  settleTracked,
  toJobView,
  type Job,
  type JobView,
  type SettleDeps,
} from '@/core/jobs'
import { logger } from '@/core/logger'
import { loadOutputImage, outputKeyFor } from '@/core/storage'
import { DECIDED_SCOPES, DEFAULT_RESOLUTION, editParamsSchema, instructionSchema, loadEditTemplate, RESOLUTIONS, type Resolution } from '@/core/templates'

import type { ScopeDecider } from './decision'
import { decideScope, type ScopeDecision } from './decide-scope'
import { composeEditPrompt } from './compose-prompt'
import { decisionPreview } from './decision-preview'
import type { EditRequest } from './edit-request'

// A photo edit (ARCHITECTURE §5.2): one ordinary generation on the built-in `edit` template whose
// input is the caller's own finished work, read server-side from R2. Charging, refunds, the
// watermark rule and the `generate` event are exactly those of a template generation.
export type EditDeps = SettleDeps & {
  decider: ScopeDecider | null
  now?: () => Date
  track?: ServerTrack
  decisionTimeoutMs?: number
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
  const { template, prompt } = await loadEditTemplate(deps.db)
  const params = editParamsSchema.safeParse(prompt.modelParams)
  if (!params.success) {
    logger.error('edit template params are incomplete', { issues: params.error.issues.map((issue) => issue.path.join('.')) })
    throw new AppError('NOT_FOUND', 'Editing is not available')
  }
  await assertWithinRateLimit(deps.db, req.userId, deps.now?.() ?? new Date(), req.jobId)
  const image = await loadOutputImage(deps.store, source.outputKey)
  return { instruction: instruction.data, source, template, prompt, params: params.data, image }
}

type Prepared = Awaited<ReturnType<typeof prepare>>

// User content and the decision only; the wrapper and paragraphs stay in template_prompts.
function jobInputs(p: Prepared, decision: ScopeDecision, resolution: Resolution, attemptId: string) {
  return {
    instruction: p.instruction,
    edit_scope: decision.scope,
    edit_probabilities: decision.probabilities,
    aspect_ratio: sourceAspect(p.source),
    resolution,
    input_key: null,
    prompt_version: p.prompt.version,
    attempt_id: attemptId,
  }
}

async function decide(deps: EditDeps, p: Prepared): Promise<ScopeDecision> {
  const questions = DECIDED_SCOPES.map((scope) => ({ scope, text: p.params.questions[scope] }))
  const imageDataUrl = await decisionPreview(p.image.bytes)
  return decideScope(deps.decider, { imageDataUrl, instruction: p.instruction, questions }, deps.decisionTimeoutMs)
}

export async function runEdit(deps: EditDeps, req: EditRequest): Promise<JobView> {
  if (req.jobId) {
    const existing = await findOwnJob(deps.db, req.userId, req.jobId)
    if (existing) return toJobView(existing)
  }
  const prepared = await prepare(deps, req)
  const decision = await decide(deps, prepared)
  const resolution = req.resolution ?? sourceResolution(prepared.source)
  const attemptId = randomUUID()
  const job = await reserveJob(deps.db, {
    jobId: req.jobId ?? randomUUID(),
    userId: req.userId,
    module: prepared.template.module,
    templateId: prepared.template.id,
    source: 'web',
    provider: deps.provider.id,
    parentJobId: prepared.source.id,
    inputs: jobInputs(prepared, decision, resolution, attemptId),
  })
  // Two concurrent requests with one job id: only the one that created the row calls the model.
  if (job.inputs.attempt_id !== attemptId) return toJobView(job)

  const call = {
    prompt: composeEditPrompt(prepared.prompt.body, prepared.params, decision.scope, prepared.instruction),
    images: [prepared.image],
    aspectRatio: sourceAspect(prepared.source),
    resolution,
    quality: prepared.template.quality,
    params: prepared.params.input_fidelity ? { input_fidelity: prepared.params.input_fidelity } : {},
  }
  const settle = () => settleGeneration(deps, job, call, outputKeyFor(req.userId, job.id))
  return toJobView(await settleTracked(job, prepared.template.category, settle, { track: deps.track }))
}
