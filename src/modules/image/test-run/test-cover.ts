import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { publishStillCover } from '@/core/admin'
import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'

import { findTestPhoto, findTestRun, markTestRunCover } from './test-run-store'

// 「设为封面」 (ARCHITECTURE §10.b): the run's result becomes the template's "after" cover and the
// test photo it started from the "before", each compressed by the cover rules (§8.3, the same
// conversion as an uploaded cover) and published under covers/{template_id}/. A run without a
// photo (a text-only template) only replaces "after". Motion covers are untouched. Returns the
// template id, for the caller to expire the catalogue cache.

export type TestCoverDeps = { db: SupabaseClient; store: ObjectStore; assets: ObjectStore; assetsBaseUrl: string | undefined }

export async function setTestRunCover(deps: TestCoverDeps, actorId: string, runId: string): Promise<string> {
  if (!deps.assetsBaseUrl) throw new AppError('INTERNAL', 'NEXT_PUBLIC_ASSETS_BASE_URL is not configured')
  const baseUrl = deps.assetsBaseUrl
  const run = await findTestRun(deps.db, runId)
  if (!run || run.status !== 'succeeded' || !run.outputKey) throw new AppError('NOT_FOUND', '这条试跑结果已不存在')
  const photo = run.photoId ? await findTestPhoto(deps.db, run.photoId) : null
  const target = (slot: 'before' | 'after') => ({ templateId: run.templateId, slot })
  const [afterUrl, beforeUrl] = await Promise.all([
    deps.store.get(run.outputKey).then((bytes) => publishStillCover(deps.assets, baseUrl, target('after'), bytes)),
    photo ? deps.store.get(photo.objectKey).then((bytes) => publishStillCover(deps.assets, baseUrl, target('before'), bytes)) : null,
  ])
  return markTestRunCover(deps.db, { actorId, runId, beforeUrl, afterUrl })
}
