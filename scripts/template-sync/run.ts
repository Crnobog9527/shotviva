import { createClient } from '@supabase/supabase-js'

import { templateSyncDryRunEnv, templateSyncEnv } from '../../src/core/env'
import { createR2Client, createR2Store } from '../../src/core/storage'
import { runSync } from './plan'
import { parseIds } from './sync'

// Pin the direction independently of the credentials: each side's public covers bucket and, for
// style references, its private uploads bucket (the test site's is fixed; production's is the
// SYNC_PRODUCTION_PRIVATE_BUCKET variable, checked in templateSyncEnv).
function endpoint(preview: boolean, settings: ReturnType<typeof templateSyncEnv>['preview'], privateBucket?: string) {
  const project = preview ? 'pnzkiqvktkzznfbyhphe' : 'irbqamjuazkkyvnnzupf'
  const bucket = preview ? 'shotviva-assets-preview' : 'shotviva-assets'
  const client = createR2Client(settings)
  return {
    db: createClient(`https://${project}.supabase.co`, settings.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    assets: { base: settings.base, store: createR2Store(client, bucket) },
    private: privateBucket ? createR2Store(client, privateBucket) : undefined,
  }
}

// `--dry-run-preview`: check each template against the preview itself and roll everything back.
// It never reaches production: no production credentials are read, and the target is the preview.
const DRY_RUN = process.argv.includes('--dry-run-preview')

function endpoints() {
  if (!DRY_RUN) {
    const { ids, series, runId, actorId, preview, production, productionPrivateBucket } = templateSyncEnv()
    return { ids, series, runId, actorId, source: endpoint(true, preview, 'shotviva-preview'),
      target: endpoint(false, production, productionPrivateBucket) }
  }
  const { ids, series, runId, actorId, serviceKey, assetsBase } = templateSyncDryRunEnv()
  // Covers and style references are never copied in a dry run, so no bucket is called; the base
  // only tells the test site's own series covers from outside addresses.
  const preview = { serviceKey, accountId: '0'.repeat(32), accessKeyId: '-', secretAccessKey: '-', base: assetsBase }
  const side = endpoint(true, preview)
  return { ids, series, runId, actorId, source: side, target: side }
}

async function run() {
  const { ids, series, runId, actorId, source, target } = endpoints()
  const request = { templateIds: ids.trim() ? parseIds(ids) : [], seriesSlugs: series.trim() ? parseIds(series) : [] }
  if (request.templateIds.length + request.seriesSlugs.length === 0) throw new Error('nothing to sync')
  const report = (line: string) => process.stdout.write(`${line}\n`)
  if (!await runSync(request, { runId, actorId, source, target, validateOnly: DRY_RUN, report })) process.exitCode = 1
}
run().catch(() => {
  process.stderr.write('INVALID_INPUT_OR_CONFIGURATION\n')
  process.exitCode = 1
})
