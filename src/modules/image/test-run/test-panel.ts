import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { TestPanelData, TestPhotoView, TestRunView } from '@/core/admin/test-runs'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage'

import type { TestPhoto, TestRun } from './test-run-row'
import { cleanupTestRuns, listTestPhotos, listTestRuns, loadTestBudget } from './test-run-store'
import { drainRemovals } from './remove-assets'
import { thumbnailKey } from './test-thumbnail'
import { testOutputKey } from './test-run-keys'
import { toTestRunView } from './test-run-view'

// The test-run panel's data (ARCHITECTURE §10.b): the template's last 50 runs, the recent test
// photos and today's budget, each image as a short-lived signed URL. Opening the panel also runs
// the 30-day cleanup (no scheduled job): rows first, in one transaction, then their R2 objects,
// best effort (a missed object only costs storage).

const SIGNED_URL_SECONDS = 600

type Deps = { db: SupabaseClient; store: ObjectStore }

const sign = (store: ObjectStore, key: string) => store.presignGet(key, { expiresInSeconds: SIGNED_URL_SECONDS })

export async function cleanupOnOpen(deps: Deps, actorId: string): Promise<void> {
  try {
    await cleanupTestRuns(deps.db, actorId)
    await drainRemovals(deps)
  } catch (error) {
    // The panel still opens; the next open tries again.
    logger.error('admin test cleanup failed', { error })
  }
}

export async function signRun(store: ObjectStore, run: TestRun): Promise<TestRunView> {
  if (!run.outputKey) return toTestRunView(run, null)
  const [url, thumb] = await Promise.all([sign(store, run.outputKey), sign(store, thumbnailKey(run.outputKey))])
  return { ...toTestRunView(run, url), thumbnailUrl: thumb }
}

// Mint on click so an open editor can download even after its preview URLs expire.
export async function signTestRunDownload(deps: Deps, runId: string) {
  const { data, error } = await deps.db.from('admin_test_runs').select('template_id, kind, output_key')
    .eq('id', runId).eq('status', 'succeeded').maybeSingle()
  if (error) throw new AppError('INTERNAL', 'test run lookup failed', { cause: error })
  if (!data || data.output_key !== testOutputKey(runId)) throw new AppError('NOT_FOUND', '找不到试跑成品')
  // Both image adapters write an original PNG to admin-tests/outputs/{runId}.png.
  return deps.store.presignGet(data.output_key, {
    expiresInSeconds: 60, downloadName: `${data.template_id}-${data.kind}-${runId}.png`,
  })
}

export async function signPhoto(store: ObjectStore, photo: TestPhoto): Promise<TestPhotoView> {
  const [url, originalUrl] = await Promise.all([sign(store, thumbnailKey(photo.objectKey)), sign(store, photo.objectKey)])
  return { id: photo.id, url, originalUrl, lastUsedAt: photo.lastUsedAt }
}

export async function loadPanelSummary(deps: Deps) {
  const [budget, recentPhotos] = await Promise.all([
    loadTestBudget(deps.db),
    listTestPhotos(deps.db).then(rows => Promise.all(rows.map(photo => signPhoto(deps.store, photo)))),
  ])
  return { budget, recentPhotos }
}

export async function loadPanelRecords(deps: Deps, templateId: string) {
  const rows = await listTestRuns(deps.db, templateId)
  const ids = [...new Set(rows.flatMap(run => run.photoId ? [run.photoId] : []))]
  const [runs, photos] = await Promise.all([
    Promise.all(rows.map(run => signRun(deps.store, run))),
    listTestPhotos(deps.db, ids).then(rows => Promise.all(rows.map(async photo => [photo.id, await sign(deps.store, photo.objectKey)] as const))),
  ])
  return { runs, photoUrls: Object.fromEntries(photos) }
}

export async function loadTestPanel(deps: Deps, templateId: string): Promise<TestPanelData> {
  const [summary, records] = await Promise.all([loadPanelSummary(deps), loadPanelRecords(deps, templateId)])
  return { ...summary, ...records }
}
