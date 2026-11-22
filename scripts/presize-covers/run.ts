/**
 * Backfills the pre-sized copies (core/presized) of every cover in a public bucket. Dry run unless
 * --write; never run against production without the control window (it schedules it with the
 * Owner). Reads the app's own R2 variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
 * and the bucket from R2_PUBLIC_BUCKET, which must match --bucket so a wrong env file stops it.
 *
 *   pnpm covers:presize --bucket shotviva-assets-preview              # dry run: counts only
 *   pnpm covers:presize --bucket shotviva-assets-preview --write
 *   pnpm covers:presize --bucket … --write --start-after covers/x/after-….webp   # resume
 *   tsx --conditions=react-server --env-file=.env.production.local scripts/presize-covers/run.ts --bucket shotviva-assets
 */
import { ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3'

import { z } from 'zod'

import { createR2Client, createR2Store, writePresizedCopies } from '../../src/core/storage'
import { runBackfill } from './backfill'

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function* listKeys(client: S3Client, bucket: string, prefix: string, startAfter?: string): AsyncIterable<string> {
  let token: string | undefined
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token, ...(token ? {} : { StartAfter: startAfter }) }))
    for (const item of page.Contents ?? []) if (item.Key) yield item.Key
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
}

// Only the four variables this needs, so an env file's unrelated settings never stop it.
const r2Env = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_PUBLIC_BUCKET: z.string().min(1),
})

async function main() {
  const bucket = argValue('--bucket')
  if (!bucket) throw new Error('--bucket <public bucket name> is required')
  const parsed = r2Env.safeParse(process.env)
  if (!parsed.success) throw new Error(`R2 settings missing: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`)
  const env = parsed.data
  if (env.R2_PUBLIC_BUCKET !== bucket) throw new Error('--bucket does not match R2_PUBLIC_BUCKET in this env file')
  const client = createR2Client({ accountId: env.R2_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY })
  const store = createR2Store(client, bucket)
  const write = process.argv.includes('--write')
  process.stdout.write(`presize covers in ${bucket} (${write ? 'WRITE' : 'dry run'})\n`)
  const counts = await runBackfill(
    {
      list: (prefix, startAfter) => listKeys(client, bucket, prefix, startAfter),
      store,
      write: (key, bytes) => writePresizedCopies(store, key, bytes),
      log: (line) => process.stdout.write(`${line}\n`),
    },
    { write, startAfter: argValue('--start-after') },
  )
  process.stdout.write(`${JSON.stringify(counts)}\n`)
  if (counts.failed > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
