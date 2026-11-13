import 'server-only'

import { randomUUID } from 'node:crypto'

import type { z } from 'zod'

import { AppError } from '@/core/errors'
import { screenIdentityText, type IdentityJudge } from '@/core/identity-guard'
import { screenCost, templateCall, typedWords, type SettleDeps, type TemplateProvider } from '@/core/jobs'
import { loadInputImage } from '@/core/storage'
import { DEFAULT_RESOLUTION, loadTestTemplate, OUTPUT_ASPECTS, validateGenerationInputs } from '@/core/templates'

import { estimateRunUsd } from './estimate'
import { continueTestRun } from './test-ledger'
import type { testGenerateBodySchema } from './test-run-request'
import type { TestRun } from './test-run-row'
import { beginTestRun, findTestPhoto, findTestRun } from './test-run-store'

// 「首次出图」 of an admin test run (ARCHITECTURE §10.b, T85): a user's template generation step for
// step (core/jobs runGeneration): the template's fields and the web's eight sizes, the photo gate,
// the face-swap screen of the typed words (§5.1a), the same provider call and settle. The daily
// budget takes the place of credits and is held before any model is called; any template
// including drafts; admin_test_runs in place of generation_jobs. Nothing reaches works, stats or
// PostHog.

export type TestRunDeps = SettleDeps & { identityJudge?: IdentityJudge | null; identityJudgeTimeoutMs?: number }

export type TestGenerateRequest = { actorId: string; body: z.infer<typeof testGenerateBodySchema> }

type FirstRunDeps = Omit<TestRunDeps, 'provider'> & { provider: TemplateProvider }

// Everything that can be refused before the budget is touched: template, photo, fields, the
// photo's bytes (HEAD, magic number, decode). No model is called here.
// A slot template's test photos by slot (§5.1e): each looked up like the single one.
async function slotPhotos(db: FirstRunDeps['db'], given: Record<string, string> | undefined) {
  if (!given) return undefined
  const found = await Promise.all(Object.entries(given).map(async ([slot, id]) => [slot, await findTestPhoto(db, id)] as const))
  if (found.some(([, photo]) => !photo)) throw new AppError('NOT_FOUND', '测试照片已被清理，请重新上传')
  return Object.fromEntries(found.map(([slot, photo]) => [slot, photo!.objectKey]))
}

async function prepare(deps: FirstRunDeps, { body }: TestGenerateRequest) {
  const loaded = await loadTestTemplate(deps.db, body.template_id)
  const photo = body.photo_id ? await findTestPhoto(deps.db, body.photo_id) : null
  if (body.photo_id && !photo) throw new AppError('NOT_FOUND', '测试照片已被清理，请重新上传')
  const slots = await slotPhotos(deps.db, body.slot_photos)
  const inputs = validateGenerationInputs(loaded.template.fields, {
    copy: body.inputs.copy,
    aspectRatio: body.inputs.aspect_ratio,
    note: body.inputs.note,
    // Admins test both states without the confirm dialog (T89): every toggle counts as accepted.
    toggles: body.inputs.toggles,
    togglesConfirmed: Object.keys(body.inputs.toggles ?? {}),
    imageCount: photo ? 1 : 0,
    ...(slots ? { slots } : {}),
    aspects: OUTPUT_ASPECTS,
  })
  const keys = inputs.slots ? inputs.slots.map((slot) => slot.upload) : photo ? [photo.objectKey] : []
  const images = await Promise.all(keys.map((key) => loadInputImage(deps.store, key)))
  const providerId = body.provider_id === undefined ? loaded.prompt.providerId : body.provider_id
  return { loaded, photo, inputs, images, providerId }
}

// Which test photo was in which slot (§5.1e); nothing for any other template.
const slotPhotoInputs = (req: TestGenerateRequest) => (req.body.slot_photos ? { slot_photos: req.body.slot_photos } : {})

export async function runTestGenerate(deps: FirstRunDeps, req: TestGenerateRequest): Promise<TestRun> {
  const existing = await findTestRun(deps.db, req.body.run_id)
  if (existing) return existing
  const { loaded, photo, inputs, images, providerId } = await prepare(deps, req)
  const resolution = req.body.inputs.resolution ?? DEFAULT_RESOLUTION
  const { call, provider, styleRefKeys } = await templateCall(deps, loaded, inputs, images, {
    resolution, providerId, omitStyleRefs: req.body.omit_style_refs,
  })
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
    inputs: {
      copy: inputs.copy,
      aspect_ratio: inputs.aspectRatio,
      ...(inputs.note ? { note: inputs.note } : {}),
      ...(Object.keys(inputs.toggles).length > 0 ? { toggles: inputs.toggles } : {}),
      ...slotPhotoInputs(req),
      style_ref_count: styleRefKeys.length,
      attempt_id: attemptId,
    },
    promptVersion: loaded.prompt.version,
    provider: provider.id,
    estimateUsd: estimateRunUsd(resolution, loaded.template.quality, provider.prices),
  })
  if (run.status !== 'running' || run.inputs.attempt_id !== attemptId) return run
  // The face-swap judge (§5.1a) only now, with the budget held: a click over the budget calls nothing.
  const step = async () => {
    const screen = await screenIdentityText({ ...deps, quiet: true }, { userId: req.actorId, entry: 'workspace', texts: typedWords(inputs) })
    return { call, decision: screenCost(deps.identityJudge, screen) }
  }
  return continueTestRun({ ...deps, provider }, run, step, deps.identityJudge?.prices)
}
