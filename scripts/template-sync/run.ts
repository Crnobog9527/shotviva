import { createClient } from '@supabase/supabase-js'
import { withDbTiers } from '../../src/core/templates/db-resolution'

import { templateSyncDryRunEnv, templateSyncEnv } from '../../src/core/env'
import { createR2Client, createR2Store } from '../../src/core/storage'
import { describeRequest } from './changes'
import { runSync } from './plan'
import { readOnlySide } from './read-only'
import { parseIds } from './sync'

// Pin the direction independently of the credentials: each side's public covers bucket and, for
// style references, its private uploads bucket (the test site's is fixed; production's is the
// SYNC_PRODUCTION_PRIVATE_BUCKET variable, checked in templateSyncEnv).
function endpoint(preview: boolean, settings: ReturnType<typeof templateSyncEnv>['preview'], privateBucket?: string) {
  const project = preview ? 'pnzkiqvktkzznfbyhphe' : 'irbqamjuazkkyvnnzupf'
  const bucket = preview ? 'shotviva-assets-preview' : 'shotviva-assets'
  const client = createR2Client(settings)
  return {
    db: createClient(`https://${project}.supabase.co`, settings.serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: withDbTiers() } }),
    assets: { base: settings.base, store: createR2Store(client, bucket) },
    private: privateBucket ? createR2Store(client, privateBucket) : undefined,
  }
}

// `--dry-run-preview`: check each template against the preview itself and roll everything back.
// It never reaches production: no production credentials are read, and the target is the preview.
const DRY_RUN = process.argv.includes('--dry-run-preview')
// `--to-preview` (2026-11-14): production → preview. Production is read through a guard that
// refuses any write (read-only.ts); the preview is the only target. Without `--write` every step
// is checked inside the preview's transactions and rolled back, after a list of what would change.
const TO_PREVIEW = process.argv.includes('--to-preview')
const WRITE = process.argv.includes('--write')

function endpoints() {
  if (TO_PREVIEW) {
    const { ids, series, runId, actorId, preview, production, productionPrivateBucket } = templateSyncEnv('to-preview')
    return { ids, series, runId, actorId, source: readOnlySide(endpoint(false, production, productionPrivateBucket)),
      target: endpoint(true, preview, 'shotviva-preview'), validateOnly: !WRITE }
  }
  if (!DRY_RUN) {
    const { ids, series, runId, actorId, preview, production, productionPrivateBucket } = templateSyncEnv()
    return { ids, series, runId, actorId, source: endpoint(true, preview, 'shotviva-preview'),
      target: endpoint(false, production, productionPrivateBucket), validateOnly: false }
  }
  const { ids, series, runId, actorId, serviceKey, assetsBase } = templateSyncDryRunEnv()
  // Covers and style references are never copied in a dry run, so no bucket is called; the base
  // only tells the test site's own series covers from outside addresses.
  const preview = { serviceKey, accountId: '0'.repeat(32), accessKeyId: '-', secretAccessKey: '-', base: assetsBase }
  const side = endpoint(true, preview)
  return { ids, series, runId, actorId, source: side, target: side, validateOnly: true }
}

async function run() {
  const { ids, series, runId, actorId, source, target, validateOnly } = endpoints()
  const request = { templateIds: ids.trim() ? parseIds(ids) : [], seriesSlugs: series.trim() ? parseIds(series) : [] }
  if (request.templateIds.length + request.seriesSlugs.length === 0) throw new Error('nothing to sync')
  const report = (line: string) => process.stdout.write(`${line}\n`)
  if (TO_PREVIEW) {
    report(`production → preview, ${validateOnly ? 'DRY RUN (every write rolled back; set write to apply)' : 'WRITE'}`)
    await describeRequest(request, source, target, report)
  }
  if (!await runSync(request, { runId, actorId, source, target, validateOnly, report })) process.exitCode = 1
}
run().catch(() => {
  process.stderr.write('INVALID_INPUT_OR_CONFIGURATION\n')
  process.exitCode = 1
})
