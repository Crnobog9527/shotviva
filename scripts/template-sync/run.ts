import { createClient } from '@supabase/supabase-js'

import { templateSyncDryRunEnv, templateSyncEnv } from '../../src/core/env'
import { createR2Client, createR2Store } from '../../src/core/storage'
import { SyncError } from './covers'
import { parseIds, syncTemplate } from './sync'

// Pin the direction independently of the credentials. Only public covers buckets are reachable.
function endpoint(preview: boolean, settings: ReturnType<typeof templateSyncEnv>['preview']) {
  const project = preview ? 'pnzkiqvktkzznfbyhphe' : 'irbqamjuazkkyvnnzupf'
  const bucket = preview ? 'shotviva-assets-preview' : 'shotviva-assets'
  return {
    db: createClient(`https://${project}.supabase.co`, settings.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    assets: { base: settings.base, store: createR2Store(createR2Client(settings), bucket) },
  }
}

// `--dry-run-preview`: check each template against the preview itself and roll everything back.
// It never reaches production: no production credentials are read, and the target is the preview.
const DRY_RUN = process.argv.includes('--dry-run-preview')

function endpoints() {
  if (!DRY_RUN) {
    const { ids, runId, preview, production } = templateSyncEnv()
    return { ids, runId, source: endpoint(true, preview), target: endpoint(false, production) }
  }
  const { ids, runId, serviceKey } = templateSyncDryRunEnv()
  // Covers are never copied in a dry run, so the asset store is never called.
  const preview = { serviceKey, accountId: '0'.repeat(32), accessKeyId: '-', secretAccessKey: '-', base: 'https://invalid.test' }
  const side = endpoint(true, preview)
  return { ids, runId, source: side, target: side }
}

async function run() {
  const { ids: input, runId, source, target } = endpoints()
  const ids = parseIds(input)
  for (const id of ids) {
    try {
      const version = await syncTemplate(id, runId, source, target, DRY_RUN)
      process.stdout.write(`${id} ${DRY_RUN ? 'DRY-RUN OK (rolled back), would write' : 'OK'} v${version}\n`)
    } catch (error) {
      // Never log PostgREST detail, stack traces, arbitrary thrown messages or source data.
      process.stderr.write(`${id} ${error instanceof SyncError ? error.message : 'SYNC_FAILED'}\n`)
      process.exitCode = 1
    }
  }
}
run().catch(() => {
  process.stderr.write('INVALID_INPUT_OR_CONFIGURATION\n')
  process.exitCode = 1
})
