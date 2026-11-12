/**
 * Batch-applies a local template file through the admin's own functions (README「模板批量脚本」).
 *
 *   pnpm templates:apply .local/templates/batch.json --dry-run   # validate everything, keep nothing
 *   pnpm templates:apply .local/templates/batch.json             # apply on the test site
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SHOTVIVA_IMPORT_ADMIN_ID (.env.local);
 * uploading covers and style references also needs TEMPLATE_TOOLS_R2_* (the test site's buckets). Prints ids, actions and
 * error codes only. Format: scripts/templates.example.json.
 */
import { dirname } from 'node:path'

import { z } from 'zod'

import { applyBatch } from './apply'
import { readBatchFile, RunError } from './batch-file'
import { envSchema, readOptions } from './options'

async function main() {
  const options = readOptions(process.argv.slice(2))
  const env = envSchema.safeParse(process.env)
  if (!env.success) throw new RunError(`环境变量缺失或不对：${env.error.issues.map(i => i.path.join('.')).join('、')}`)
  return applyBatch(readBatchFile(options.file), dirname(options.file), env.data, options.dryRun)
}

main().catch((error: unknown) => {
  // Our own messages only: a library error may carry request detail or a key.
  const ours = error instanceof RunError || (error instanceof Error && !(error instanceof z.ZodError) && !/https?:\/\/|token|eyJ|secret/i.test(error.message))
  process.stderr.write(`${ours ? (error as Error).message : 'FAILED'}\n`)
  process.exitCode = 1
})
