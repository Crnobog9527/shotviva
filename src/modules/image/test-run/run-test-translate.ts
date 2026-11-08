import 'server-only'

import { randomUUID } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

import { AppError } from '@/core/errors'
import type { SettleDeps } from '@/core/jobs'
import { loadOutputImage, type ObjectStore } from '@/core/storage'
import { editParamsSchema, EDIT_TEMPLATE_ID, loadTestTemplate, type Resolution } from '@/core/templates'

import { estimateRunUsd } from './estimate'
import { continueTestRun } from './test-ledger'
import type { testTranslateBodySchema } from './test-run-request'
import type { TestRun } from './test-run-row'
import { beginTestRun, findTestRun } from './test-run-store'

// 「生成其他语言版本」 of a template cover (ARCHITECTURE §8.3, T87): an image edit of the approved
// "after" cover that only translates the words in the picture, as an admin test run (§10.b): same
// records, real cost, spend ledger and daily budget, held before the model is called. The prompt is
// the `edit` template's cover_translate parameter (admin-editable, never in the repository) with
// {{language}} replaced; its input fidelity and quality tier apply. No user words, so no face-swap
// judge. The result is previewed in the admin and set as that language's cover from there.

export type TestTranslateDeps = SettleDeps & { assets: ObjectStore; assetsBaseUrl: string | undefined }

export type TestTranslateRequest = { actorId: string; body: z.infer<typeof testTranslateBodySchema> }

const DEFAULT_TRANSLATE_RESOLUTION: Resolution = '2k'

// The English name of a language code ("ja" → "Japanese"), so no language is hard-wired here.
export function languageName(code: string): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
}

// The edit template (published or not: this is the admin's tool) and its translation prompt. A
// parameter that does not parse says which one; a missing prompt says where to write it.
async function loadTranslateSetup(db: SupabaseClient) {
  const loaded = await loadTestTemplate(db, EDIT_TEMPLATE_ID, { allowEdit: true })
  const params = editParamsSchema.partial().safeParse(loaded.prompt.modelParams)
  if (!params.success) {
    const fields = params.error.issues.map((issue) => issue.path.join('.') || 'model_params').join('、')
    throw new AppError('INVALID_INPUT', `「作品编辑」的参数不合法（${fields}），先在那一页改好再翻译`)
  }
  const prompt = params.data.cover_translate?.trim()
  if (!prompt) throw new AppError('NOT_FOUND', '还没有填封面翻译提示词：在「作品编辑的判断题和约束段落」页填写')
  return { loaded, prompt, inputFidelity: params.data.input_fidelity }
}

// The source "after" cover as the model's input: read from the public bucket by its key.
async function sourceImage(deps: TestTranslateDeps, url: string | null | undefined) {
  const base = deps.assetsBaseUrl ? `${deps.assetsBaseUrl}/` : null
  if (!url || !base || !url.startsWith(`${base}covers/`)) throw new AppError('NOT_FOUND', '这个页签还没有「后」封面，先上传或设一张')
  return loadOutputImage(deps.assets, url.slice(base.length))
}

export async function runTestTranslate(deps: TestTranslateDeps, req: TestTranslateRequest): Promise<TestRun> {
  const existing = await findTestRun(deps.db, req.body.run_id)
  if (existing) return existing
  const { body } = req
  if (body.source_locale === body.target_locale) throw new AppError('INVALID_INPUT', '目标语言和来源相同')
  const template = (await loadTestTemplate(deps.db, body.template_id)).template
  const sourceUrl = body.source_locale ? template.coverLocales[body.source_locale]?.after : template.coverAfterUrl
  const [setup, image] = await Promise.all([loadTranslateSetup(deps.db), sourceImage(deps, sourceUrl)])
  const resolution = body.resolution ?? DEFAULT_TRANSLATE_RESOLUTION
  const attemptId = randomUUID()
  const run = await beginTestRun(deps.db, {
    actorId: req.actorId,
    runId: body.run_id,
    templateId: template.id,
    kind: 'translate',
    parentId: null,
    photoId: null,
    batchId: body.batch_id,
    resolution,
    // The prompt is the edit template's cover_translate, not this template's: its version is kept
    // in inputs under its own name, and prompt_version (this template's) stays empty.
    inputs: {
      source_locale: body.source_locale,
      target_locale: body.target_locale,
      source_url: sourceUrl,
      aspect_ratio: 'original',
      translate_prompt: 'edit.cover_translate',
      translate_prompt_version: setup.loaded.prompt.version,
      attempt_id: attemptId,
    },
    promptVersion: null,
    provider: deps.provider.id,
    estimateUsd: estimateRunUsd(resolution, setup.loaded.template.quality, deps.provider.prices),
  })
  if (run.status !== 'running' || run.inputs.attempt_id !== attemptId) return run
  const call = {
    prompt: setup.prompt.replaceAll('{{language}}', languageName(body.target_locale)),
    images: [image],
    aspectRatio: 'original',
    resolution,
    quality: setup.loaded.template.quality,
    params: setup.inputFidelity ? { input_fidelity: setup.inputFidelity } : {},
  }
  return continueTestRun(deps, run, async () => ({ call }), null)
}
