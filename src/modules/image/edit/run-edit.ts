import 'server-only'

import { randomUUID } from 'node:crypto'

import type { ServerTrack } from '@/core/analytics'
import { AppError } from '@/core/errors'
import { IDENTITY_EDIT_ADDENDUM, matchIdentitySwapKeyword, refuseIdentitySwap, takeJudgeSlot, tooManyJudgeCalls } from '@/core/identity-guard'
import {
  accountLimits,
  assertWithinRateLimit,
  findOwnJob,
  recordJobClientIp,
  reserveJob,
  settleGeneration,
  settleTracked,
  toJobView,
  type DecisionCost,
  type Job,
  type JobView,
  type SettleDeps,
} from '@/core/jobs'
import { logger } from '@/core/logger'
import { loadOutputImage, outputKeyFor } from '@/core/storage'
import { DEFAULT_RESOLUTION, editParamsSchema, instructionSchema, loadEditTemplate, RESOLUTIONS, type Resolution } from '@/core/templates'

import type { ScopeClassifier } from './classifier'
import { classifyEditScope, type EditClassification } from './classify-scope'
import { composeEditPrompt } from './compose-prompt'
import { decisionPreview } from './decision-preview'
import type { EditRequest } from './edit-request'

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
  const { template, prompt } = await loadEditTemplate(deps.db)
  const params = editParamsSchema.safeParse(prompt.modelParams)
  if (!params.success) {
    logger.error('edit template params are incomplete', { issues: params.error.issues.map((issue) => issue.path.join('.')) })
    throw new AppError('NOT_FOUND', 'Editing is not available')
  }
  const limits = await accountLimits(deps.db, req.userId)
  await assertWithinRateLimit(deps.db, req.userId, deps.now?.() ?? new Date(), limits, { jobId: req.jobId })
  const image = await loadOutputImage(deps.store, source.outputKey)
  // The size asked for (T47: the panel offers the eight), else the work's own; another size
  // than the work's ends the prompt with the reframe paragraph.
  const aspect = req.aspect ?? sourceAspect(source)
  const reframed = aspect !== sourceAspect(source)
  return { instruction: instruction.data, source, template, prompt, params: params.data, image, aspect, reframed }
}

type Prepared = Awaited<ReturnType<typeof prepare>>

// User content and the classifier's answer only (ARCHITECTURE §5.2); the wrapper, classifier
// instructions and paragraphs stay in template_prompts. The classifier's tokens are not user
// content: they go to provider_usage and cost_usd with the image call's (decisionCost).
function jobInputs(p: Prepared, decision: EditClassification, resolution: Resolution, attemptId: string) {
  return {
    instruction: p.instruction,
    edit_scope: decision.scope,
    confidence: decision.confidence,
    keep: decision.keep,
    change: decision.change,
    aspect_ratio: p.aspect,
    resolution,
    input_key: null,
    prompt_version: p.prompt.version,
    attempt_id: attemptId,
  }
}

// The decision step's tokens priced at the decision row's rates (T33); none when it never answered.
function decisionCost(classifier: ScopeClassifier | null, decision: EditClassification): DecisionCost | undefined {
  if (!decision.usage) return undefined
  return {
    usage: { decision_input_tokens: decision.usage.inputTokens, decision_output_tokens: decision.usage.outputTokens },
    prices: classifier?.prices ?? null,
  }
}

async function classify(deps: EditDeps, p: Prepared): Promise<EditClassification> {
  const imageDataUrl = await decisionPreview(p.image.bytes)
  // The edit template's own instructions, untouched, plus the face-swap question (§5.1a), so the
  // one scope call answers both. Nothing here reaches the image model.
  const instructions = `${p.params.classifier.trim()}\n\n${IDENTITY_EDIT_ADDENDUM}`
  return classifyEditScope(deps.classifier, { imageDataUrl, instruction: p.instruction, instructions }, deps.classifierTimeoutMs)
}

// ARCHITECTURE §5.1a for an edit: the keyword list first (no call), then the scope call's own
// identity_swap answer. Either refuses before reserve_credits, so nothing is charged. The scope
// call counts against the account's hourly decision calls like the workspace's (judge-slots.ts).
async function screenedDecision(deps: EditDeps, req: EditRequest, p: Prepared): Promise<EditClassification> {
  const refusal = { userId: req.userId, entry: 'edit' as const, text: p.instruction }
  if (matchIdentitySwapKeyword(p.instruction)) await refuseIdentitySwap(deps, { ...refusal, method: 'keyword' })
  if (deps.classifier && (await takeJudgeSlot(deps.db, req.userId, null)).status === 'limited') throw tooManyJudgeCalls()
  const decision = await classify(deps, p)
  if (decision.identitySwap) await refuseIdentitySwap(deps, { ...refusal, method: 'model', usage: decision.usage })
  return decision
}

export async function runEdit(deps: EditDeps, req: EditRequest): Promise<JobView> {
  if (req.jobId) {
    const existing = await findOwnJob(deps.db, req.userId, req.jobId)
    if (existing) return toJobView(existing)
  }
  const prepared = await prepare(deps, req)
  const decision = await screenedDecision(deps, req, prepared)
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
  // Dispute evidence (T82): the IP that started this edit.
  await recordJobClientIp(deps.db, { userId: req.userId, jobId: job.id, ip: req.clientIp })

  const call = {
    prompt: composeEditPrompt(prepared.prompt.body, prepared.params, decision.scope, prepared.instruction, decision.keep, prepared.reframed),
    images: [prepared.image],
    aspectRatio: prepared.aspect,
    resolution,
    quality: prepared.template.quality,
    params: prepared.params.input_fidelity ? { input_fidelity: prepared.params.input_fidelity } : {},
  }
  const settle = () => settleGeneration(deps, job, call, outputKeyFor(req.userId, job.id), { decision: decisionCost(deps.classifier, decision) })
  return toJobView(await settleTracked(job, prepared.template.category, settle, { track: deps.track }))
}
