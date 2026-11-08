import 'server-only'

import { randomUUID } from 'node:crypto'

import type { z } from 'zod'

import { AppError } from '@/core/errors'
import { loadOutputImage } from '@/core/storage'
import { instructionSchema } from '@/core/templates'

import { decideEdit, editDecisionCost, editProviderCall, editRecord, loadEditPipeline, type ScopeClassifier } from '../edit'
import { estimateRunUsd } from './estimate'
import type { TestRunDeps } from './run-test-generate'
import { continueTestRun } from './test-ledger'
import type { testEditBodySchema } from './test-run-request'
import type { TestRun } from './test-run-row'
import { beginTestRun, findTestRun, recordDecision } from './test-run-store'

// 「编辑」 on an admin test run (ARCHITECTURE §10.b, T85): a user's photo edit (§5.2, run-edit.ts)
// on one of the template's test results instead of a work. The same `edit` template, scope decision
// with its fallback and face-swap answer, paragraphs, sizes and provider call; the result is a new
// run whose parent is the one edited, so edits of edits form the tree the panel draws.

export type TestEditDeps = TestRunDeps & { classifier: ScopeClassifier | null; classifierTimeoutMs?: number }

export type TestEditRequest = { actorId: string; body: z.infer<typeof testEditBodySchema> }

// A fixed width:height ratio is kept as asked; 'original' follows the pixels (as run-edit.ts).
function runAspect(run: TestRun): string {
  const aspect = run.inputs.aspect_ratio
  return typeof aspect === 'string' && /^\d{1,2}:\d{1,2}$/.test(aspect) ? aspect : 'original'
}

// Everything that can be refused before the budget is touched; no model is called here.
async function prepare(deps: TestEditDeps, { body }: TestEditRequest) {
  const instruction = instructionSchema.safeParse(body.instruction)
  if (!instruction.success) throw new AppError('INVALID_INPUT', '要改的地方写 1～500 个字')
  const parent = await findTestRun(deps.db, body.parent_id)
  if (!parent || parent.status !== 'succeeded' || !parent.outputKey) throw new AppError('NOT_FOUND', '这条试跑结果已不存在')
  const pipeline = await loadEditPipeline(deps.db)
  const image = await loadOutputImage(deps.store, parent.outputKey)
  const aspect = body.aspect_ratio ?? runAspect(parent)
  return { instruction: instruction.data, parent, pipeline, image, aspect, reframed: aspect !== runAspect(parent) }
}

type Prepared = Awaited<ReturnType<typeof prepare>>

function begin(deps: TestEditDeps, req: TestEditRequest, p: Prepared, attemptId: string) {
  const resolution = req.body.resolution ?? p.parent.resolution
  return beginTestRun(deps.db, {
    actorId: req.actorId,
    runId: req.body.run_id,
    templateId: p.parent.templateId,
    kind: 'edit',
    parentId: p.parent.id,
    photoId: p.parent.photoId,
    batchId: req.body.batch_id,
    resolution,
    // The scope decision is filled in once it has run (admin_finish_test_run keeps inputs).
    inputs: { instruction: p.instruction, aspect_ratio: p.aspect, attempt_id: attemptId },
    promptVersion: p.pipeline.prompt.version,
    provider: deps.provider.id,
    estimateUsd: estimateRunUsd(resolution, p.pipeline.template.quality, deps.provider.prices),
  })
}

export async function runTestEdit(deps: TestEditDeps, req: TestEditRequest): Promise<TestRun> {
  const existing = await findTestRun(deps.db, req.body.run_id)
  if (existing) return existing
  const p = await prepare(deps, req)
  const attemptId = randomUUID()
  const run = await begin(deps, req, p, attemptId)
  if (run.status !== 'running' || run.inputs.attempt_id !== attemptId) return run
  // The scope call (which also answers the face-swap question) only now, with the budget held.
  const step = async () => {
    const decision = await decideEdit({ ...deps, quiet: true }, { userId: req.actorId, pipeline: p.pipeline, image: p.image, instruction: p.instruction })
    await recordDecision(deps.db, run.id, { ...editRecord(decision, p.instruction), aspect_ratio: p.aspect, attempt_id: attemptId })
    const call = editProviderCall(p.pipeline, decision, { image: p.image, instruction: p.instruction, aspect: p.aspect, reframed: p.reframed, resolution: run.resolution })
    return { call, decision: editDecisionCost(deps.classifier, decision) }
  }
  return continueTestRun(deps, run, step, deps.classifier?.prices)
}
