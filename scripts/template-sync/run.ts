import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { createR2Client, createR2Store } from '../../src/core/storage/r2-store'
import { SyncError } from './covers'
import { targetFloors } from './pricing'
import { parseIds, syncTemplate } from './sync'

// Pin the direction independently of the credentials. Only public covers buckets are reachable.
const config = z.object({
  serviceKey: z.string().min(1), accountId: z.string().regex(/^[0-9a-f]{32}$/),
  accessKeyId: z.string().min(1), secretAccessKey: z.string().min(1),
  base: z.url({ protocol: /^https$/ }).transform(s => s.replace(/\/+$/, '')),
})
function endpoint(preview: boolean) {
  const prefix = preview ? 'SYNC_PREVIEW_' : 'SYNC_PRODUCTION_'
  const variable = (name: string) => process.env[prefix + name]
  const settings = config.parse({
    serviceKey: variable('SERVICE_KEY'), accountId: variable('R2_ACCOUNT_ID'),
    accessKeyId: variable('R2_ACCESS_KEY_ID'), secretAccessKey: variable('R2_SECRET_ACCESS_KEY'),
    base: preview ? variable('ASSETS_BASE') : 'https://shotviva.com/assets',
  })
  const project = preview ? 'pnzkiqvktkzznfbyhphe' : 'irbqamjuazkkyvnnzupf'
  const bucket = preview ? 'shotviva-assets-preview' : 'shotviva-assets'
  return {
    db: createClient(`https://${project}.supabase.co`, settings.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    assets: { base: settings.base, store: createR2Store(createR2Client(settings), bucket) },
  }
}

async function run() {
  const ids = parseIds(process.env.SYNC_IDS ?? '')
  const runId = z.string().regex(/^\d+$/).parse(process.env.GITHUB_RUN_ID)
  const source = endpoint(true)
  const target = endpoint(false)
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
