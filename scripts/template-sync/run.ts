import { createClient } from '@supabase/supabase-js'

import { templateSyncEnv } from '../../src/core/env'
import { createR2Client, createR2Store } from '../../src/core/storage/r2-store'
import { SyncError } from './covers'
import { targetFloors } from './pricing'
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

async function run() {
  const { ids: input, runId, preview, production } = templateSyncEnv()
  const ids = parseIds(input)
  const source = endpoint(true, preview)
  const target = endpoint(false, production)
  const floors = await targetFloors(target.db)
  for (const id of ids) {
    try {
      const version = await syncTemplate(id, runId, source, target, floors)
      process.stdout.write(`${id} OK v${version}\n`)
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
