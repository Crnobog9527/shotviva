/**
 * Copies the test site's vessel library (ARCHITECTURE §5.1c「器皿图库」) to production: Actions →
 * "Sync vessel library to production" (production-manual, main only; the control window runs it).
 * Every test row and its image; production rows the test site no longer has are switched off.
 * Prints labels and counts only.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { listDishware } from '../../src/core/dishware/admin'
import { syncPrivateBucket } from '../../src/core/env'
import { withDbTiers } from '../../src/core/templates/db-resolution'
import { createR2Client, createR2Store } from '../../src/core/storage'
import { mirrorDishware, type MirrorItem } from './mirror'

const MAX_BYTES = 20 * 1024 * 1024
// Pinned like the template sync's (scripts/template-sync/run.ts): the credentials cannot turn it around.
const PREVIEW = { project: 'pnzkiqvktkzznfbyhphe', bucket: 'shotviva-preview' }
const PRODUCTION_PROJECT = 'irbqamjuazkkyvnnzupf'

const side = z.object({
  serviceKey: z.string().min(1), accountId: z.string().regex(/^[0-9a-f]{32}$/), accessKeyId: z.string().min(1), secretAccessKey: z.string().min(1),
})
const read = (prefix: 'SYNC_PREVIEW_' | 'SYNC_PRODUCTION_') => side.parse({
  serviceKey: process.env[prefix + 'SERVICE_KEY'], accountId: process.env[prefix + 'R2_ACCOUNT_ID'],
  accessKeyId: process.env[prefix + 'R2_ACCESS_KEY_ID'], secretAccessKey: process.env[prefix + 'R2_SECRET_ACCESS_KEY'],
})

function endpoint(project: string, bucket: string, settings: z.infer<typeof side>) {
  return {
    db: createClient(`https://${project}.supabase.co`, settings.serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: withDbTiers() } }),
    store: createR2Store(createR2Client(settings), bucket),
  }
}

async function run() {
  const bucket = syncPrivateBucket(process.env.SYNC_PRODUCTION_PRIVATE_BUCKET)
  if (!bucket) throw new Error('SYNC_PRODUCTION_PRIVATE_BUCKET')
  const actorId = z.uuid().parse(process.env.SYNC_PRODUCTION_ACTOR_ID)
  const source = endpoint(PREVIEW.project, PREVIEW.bucket, read('SYNC_PREVIEW_'))
  const target = endpoint(PRODUCTION_PROJECT, bucket, read('SYNC_PRODUCTION_'))
  const items: MirrorItem[] = (await listDishware(source.db)).map((item) => ({ ...item, bytes: () => source.store.get(item.imageKey, MAX_BYTES) }))
  if (items.length === 0) throw new Error('the test site has no vessels')
  const current = await listDishware(target.db)
  const result = await mirrorDishware({ ...target, actorId, current }, items, (line) => process.stdout.write(`${line}\n`))
  process.stdout.write(`written ${result.written}, saved ${result.saved}, switched off ${result.deactivated}\n`)
}

run().catch((error: unknown) => {
  // Our own codes only: a library error may carry a request or a key.
  const ours = error instanceof Error && /^(DISHWARE_|NOT_ADMIN|INVALID_INPUT|SYNC_PRODUCTION_PRIVATE_BUCKET|the test site)/.test(error.message)
  process.stderr.write(`${ours ? (error as Error).message : 'INVALID_INPUT_OR_CONFIGURATION'}\n`)
  process.exitCode = 1
})
