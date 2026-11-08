import 'server-only'

import { randomUUID } from 'node:crypto'

import type { z } from 'zod'

import { AppError } from '@/core/errors'
import { screenIdentityText, type IdentityJudge } from '@/core/identity-guard'
import { screenCost, templateCall, typedWords, type SettleDeps } from '@/core/jobs'
import { loadInputImage } from '@/core/storage'
import { DEFAULT_RESOLUTION, loadTestTemplate, OUTPUT_ASPECTS, validateGenerationInputs } from '@/core/templates'

import { estimateRunUsd } from './estimate'
import { settleTestRun } from './test-ledger'
import type { testGenerateBodySchema } from './test-run-request'
import type { TestRun } from './test-run-row'
import { beginTestRun, findTestPhoto, findTestRun } from './test-run-store'

// 「首次出图」 of an admin test run (ARCHITECTURE §10.b, T85): a user's template generation step for
// step (core/jobs runGeneration) — the template's fields and the web's eight sizes, the face-swap
// screen of the typed words (§5.1a), the photo gate, the same provider call and settle — with the
// daily budget in place of credits, any template including drafts, and admin_test_runs in place
// of generation_jobs. Nothing reaches works, stats or PostHog.

export type TestRunDeps = SettleDeps & { identityJudge?: IdentityJudge | null; identityJudgeTimeoutMs?: number }

export type TestGenerateRequest = { actorId: string; body: z.infer<typeof testGenerateBodySchema> }

async function prepare(deps: TestRunDeps, { actorId, body }: TestGenerateRequest) {
  const loaded = await loadTestTemplate(deps.db, body.template_id)
  const photo = body.photo_id ? await findTestPhoto(deps.db, body.photo_id) : null
  if (body.photo_id && !photo) throw new AppError('NOT_FOUND', '测试照片已被清理，请重新上传')
  const inputs = validateGenerationInputs(loaded.template.fields, {
    copy: body.inputs.copy,
    aspectRatio: body.inputs.aspect_ratio,
    note: body.inputs.note,
    imageCount: photo ? 1 : 0,
    aspects: OUTPUT_ASPECTS,
  })
  const [screen, image] = await Promise.all([
    screenIdentityText({ ...deps, quiet: true }, { userId: actorId, entry: 'workspace', texts: typedWords(inputs) }),
    photo ? loadInputImage(deps.store, photo.objectKey) : null,
  ])
  return { loaded, photo, inputs, screen, image }
}

export async function runTestGenerate(deps: TestRunDeps, req: TestGenerateRequest): Promise<TestRun> {
  const existing = await findTestRun(deps.db, req.body.run_id)
  if (existing) return existing
  const { loaded, photo, inputs, screen, image } = await prepare(deps, req)
  const resolution = req.body.inputs.resolution ?? DEFAULT_RESOLUTION
  // Marks the request that created the row; a concurrent repeat gets the row and calls nothing.
  const attemptId = randomUUID()
  const run = await beginTestRun(deps.db, {
    actorId: req.actorId,
    runId: req.body.run_id,
    templateId: loaded.template.id,
    kind: 'generate',
    parentId: null,
    photoId: photo?.id ?? null,
    batchId: req.body.batch_id,
    resolution,
    inputs: { copy: inputs.copy, aspect_ratio: inputs.aspectRatio, ...(inputs.note ? { note: inputs.note } : {}), attempt_id: attemptId },
    promptVersion: loaded.prompt.version,
    provider: deps.provider.id,
    estimateUsd: estimateRunUsd(resolution, loaded.template.quality, deps.provider.prices),
  })
  if (run.status !== 'running' || run.inputs.attempt_id !== attemptId) return run
  return settleTestRun(deps, run, templateCall(loaded, inputs, image, resolution), screenCost(deps.identityJudge, screen))
}
