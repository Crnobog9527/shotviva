import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

// The covers folder only: the @/core/admin barrel would pull the admin editors' client code into
// every page that imports @/modules/image (JS budget).
import { publishStillCover } from '@/core/admin/covers'
import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'

import { findTestPhoto, findTestRun, markTestRunCover } from './test-run-store'

// 「设为封面」 (ARCHITECTURE §10.b): the run's result becomes the template's "after" cover and the
// test photo it started from the "before", each compressed by the cover rules (§8.3, the same
// conversion as an uploaded cover) and published under covers/{template_id}/. A run without a
// photo (a text-only template) only replaces "after". Motion covers are untouched. Returns the
// template id, for the caller to expire the catalogue cache.

export type TestCoverDeps = { db: SupabaseClient; store: ObjectStore; assets: ObjectStore; assetsBaseUrl: string | undefined }

// locale: null sets the common cover; a code sets that language's own (T87). For a language the
// "before" is written only when the template has no common one (the photo side is shared, 0823);
// a translation run has no test photo, so it only ever sets "after".
export async function setTestRunCover(deps: TestCoverDeps, actorId: string, runId: string, locale: string | null = null): Promise<string> {
  if (!deps.assetsBaseUrl) throw new AppError('INTERNAL', 'NEXT_PUBLIC_ASSETS_BASE_URL is not configured')
  const baseUrl = deps.assetsBaseUrl
  const run = await coverableRun(deps.db, runId, locale)
  const photo = run.photoId ? await findTestPhoto(deps.db, run.photoId) : null
  const target = (slot: 'before' | 'after') => ({ templateId: run.templateId, slot })
  const [afterUrl, beforeUrl] = await Promise.all([
    deps.store.get(run.outputKey).then((bytes) => publishStillCover(deps.assets, baseUrl, target('after'), bytes)),
    photo ? deps.store.get(photo.objectKey).then((bytes) => publishStillCover(deps.assets, baseUrl, target('before'), bytes)) : null,
  ])
  return markTestRunCover(deps.db, { actorId, runId, beforeUrl, afterUrl, locale })
}

// A succeeded run with a result; a translation only ever becomes its target language's "after"
// (0823 refuses anything else too).
async function coverableRun(db: SupabaseClient, runId: string, locale: string | null) {
  const run = await findTestRun(db, runId)
  if (!run || run.status !== 'succeeded' || !run.outputKey) throw new AppError('NOT_FOUND', '这条试跑结果已不存在')
  if (run.kind === 'translate' && locale !== run.inputs.target_locale) throw new AppError('INVALID_INPUT', '翻译结果只能设为它所翻译的那个语言的后图')
  return { ...run, outputKey: run.outputKey }
}
