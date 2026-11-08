import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ServerTrack } from '@/core/analytics'
import { AppError } from '@/core/errors'
import { FAIL_OPEN_LOG, IDENTITY_EDIT_ADDENDUM, markJudgeFailed, refuseIdentitySwap, takeJudgeSlot, tooManyJudgeCalls } from '@/core/identity-guard'
import type { DecisionCost, ProviderInput } from '@/core/jobs'
import { logger } from '@/core/logger'
import type { InputImage } from '@/core/storage'
import { editParamsSchema, loadEditTemplate, type EditParams, type GenerationTemplate, type Resolution } from '@/core/templates'

import type { ScopeClassifier } from './classifier'
import { classifyEditScope, type EditClassification } from './classify-scope'
import { composeEditPrompt } from './compose-prompt'
import { decisionPreview } from './decision-preview'

// The steps of a photo edit (ARCHITECTURE §5.2) that do not depend on who pays or where the
// source lives: the `edit` template and its parameters, the scope decision (which also answers the
// face-swap question, §5.1a), and the provider call. A user's edit (run-edit.ts) and an admin test
// run's edit (§10.b, T85) both go through exactly these.

export type EditPipeline = GenerationTemplate & { params: EditParams }

// The built-in `edit` template, published, with complete parameters; NOT_FOUND otherwise.
export async function loadEditPipeline(db: SupabaseClient): Promise<EditPipeline> {
  const { template, prompt } = await loadEditTemplate(db)
  const params = editParamsSchema.safeParse(prompt.modelParams)
  if (!params.success) {
    logger.error('edit template params are incomplete', { issues: params.error.issues.map((issue) => issue.path.join('.')) })
    throw new AppError('NOT_FOUND', 'Editing is not available')
  }
  return { template, prompt, params: params.data }
}

// quiet: an admin test run, refused the same way but leaving no refusal row or event and taking no
// judge slot (T85: the admin's hourly quota and /admin/providers' counts are users' only).
export type DecideDeps = { db: SupabaseClient; classifier: ScopeClassifier | null; classifierTimeoutMs?: number; track?: ServerTrack; quiet?: boolean }

export type DecideInput = { userId: string; pipeline: EditPipeline; image: InputImage; instruction: string }

async function classify(deps: DecideDeps, input: DecideInput): Promise<EditClassification> {
  const imageDataUrl = await decisionPreview(input.image.bytes)
  // The edit template's own instructions, untouched, plus the face-swap question (§5.1a), so the
  // one scope call answers both. Nothing here reaches the image model.
  const instructions = `${input.pipeline.params.classifier.trim()}\n\n${IDENTITY_EDIT_ADDENDUM}`
  return classifyEditScope(deps.classifier, { imageDataUrl, instruction: input.instruction, instructions }, deps.classifierTimeoutMs)
}

// ARCHITECTURE §5.1a for an edit: the scope call's own identity_swap answer refuses before
// anything is charged or started. The call counts against the account's hourly decision calls
// like the workspace's (judge-slots.ts).
export async function decideEdit(deps: DecideDeps, input: DecideInput): Promise<EditClassification> {
  const slot = deps.classifier && !deps.quiet ? await takeJudgeSlot(deps.db, input.userId, null) : null
  if (slot?.status === 'limited') throw tooManyJudgeCalls()
  const decision = await classify(deps, input)
  // The scope call never answered (both 5 s attempts, or an error): the edit goes through
  // unscreened, counted like the workspace's fail-opens.
  if (slot && decision.confidence === null) {
    logger.warn(FAIL_OPEN_LOG, { provider: deps.classifier?.tag, entry: 'edit' })
    await markJudgeFailed(deps.db, slot)
  }
  if (decision.identitySwap) {
    await refuseIdentitySwap(deps, { userId: input.userId, entry: 'edit', text: input.instruction, method: 'model', usage: decision.usage })
  }
  return decision
}

// The decision step's tokens priced at the decision row's rates (T33); none when it never answered.
export function editDecisionCost(classifier: ScopeClassifier | null, decision: EditClassification): DecisionCost | undefined {
  if (!decision.usage) return undefined
  return {
    usage: { decision_input_tokens: decision.usage.inputTokens, decision_output_tokens: decision.usage.outputTokens },
    prices: classifier?.prices ?? null,
  }
}

export type EditCallInput = { image: InputImage; instruction: string; aspect: string; reframed: boolean; resolution: Resolution }

// What the image model receives for an edit: the wrapper, the judged range's paragraph, the
// user's words and, for a new size, the reframe paragraph (compose-prompt.ts).
export function editProviderCall(pipeline: EditPipeline, decision: EditClassification, input: EditCallInput): Omit<ProviderInput, 'signal'> {
  const { params } = pipeline
  return {
    prompt: composeEditPrompt(pipeline.prompt.body, params, decision.scope, input.instruction, decision.keep, input.reframed),
    images: [input.image],
    aspectRatio: input.aspect,
    resolution: input.resolution,
    quality: pipeline.template.quality,
    params: params.input_fidelity ? { input_fidelity: params.input_fidelity } : {},
  }
}

// What an edit stores as user content (§5.2 「存档」): the words and the classifier's answer.
export function editRecord(decision: EditClassification, instruction: string) {
  return { instruction, edit_scope: decision.scope, confidence: decision.confidence, keep: decision.keep, change: decision.change }
}
