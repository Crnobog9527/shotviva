import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { TestPanelData, TestPhotoView, TestRunView } from '@/core/admin/test-runs'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage'

import type { TestPhoto, TestRun } from './test-run-row'
import { cleanupTestRuns, listTestPhotos, listTestRuns, loadTestBudget } from './test-run-store'
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
    const keys = await cleanupTestRuns(deps.db, actorId)
    const results = await Promise.allSettled(keys.map((key) => deps.store.delete(key)))
    const missed = results.filter((result) => result.status === 'rejected').length
    if (missed > 0) logger.warn('admin test cleanup left objects behind', { missed, total: keys.length })
  } catch (error) {
    // The panel still opens; the next open tries again.
    logger.error('admin test cleanup failed', { error })
  }
}

export async function signRun(store: ObjectStore, run: TestRun): Promise<TestRunView> {
  return toTestRunView(run, run.outputKey ? await sign(store, run.outputKey) : null)
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

const signPhoto = async (store: ObjectStore, photo: TestPhoto): Promise<TestPhotoView> => ({
  id: photo.id,
  url: await sign(store, photo.objectKey),
  lastUsedAt: photo.lastUsedAt,
})

export async function loadTestPanel(deps: Deps, templateId: string): Promise<TestPanelData> {
  const [runs, budget] = await Promise.all([listTestRuns(deps.db, templateId), loadTestBudget(deps.db)])
  const photoIds = [...new Set(runs.flatMap((run) => (run.photoId ? [run.photoId] : [])))]
  const photos = await listTestPhotos(deps.db, photoIds)
  const [views, recent, used] = await Promise.all([
    Promise.all(runs.map((run) => signRun(deps.store, run))),
    Promise.all(photos.recent.map((photo) => signPhoto(deps.store, photo))),
    Promise.all(photos.used.map((photo) => signPhoto(deps.store, photo))),
  ])
  const photoUrls = Object.fromEntries([...used, ...recent].map((photo) => [photo.id, photo.url]))
  return { runs: views, recentPhotos: recent, photoUrls, budget }
}
