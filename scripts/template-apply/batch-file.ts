import { readFileSync } from 'node:fs'

import { createR2Client, createR2Store } from '../../src/core/storage'
import type { Target } from './options'
import { parseBatch, type Batch } from './schema'

// Shared by templates:apply and templates:trial. Errors here are ours to print; nothing in them
// echoes the file's contents.
export class RunError extends Error {}

export function readBatchFile(path: string): Batch {
  let input: unknown
  try { input = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new RunError('读不了批次文件（不存在或不是 JSON）') }
  try { return parseBatch(input) } catch (error) { throw new RunError(error instanceof Error ? error.message : '批次文件格式不对') }
}

// The target's own buckets with this tool's R2 keys: TEMPLATE_TOOLS_R2_*, never the shell's R2_*
// (Node's --env-file does not override variables the shell already has, and those may belong to
// another project). None on a local stack.
export function targetStores(target: Target, env: NodeJS.ProcessEnv = process.env) {
  const accountId = env.TEMPLATE_TOOLS_R2_ACCOUNT_ID
  const accessKeyId = env.TEMPLATE_TOOLS_R2_ACCESS_KEY_ID
  const secretAccessKey = env.TEMPLATE_TOOLS_R2_SECRET_ACCESS_KEY
  if (!target.storage || !accountId || !accessKeyId || !secretAccessKey) return {}
  const client = createR2Client({ accountId, accessKeyId, secretAccessKey })
  return { privateStore: createR2Store(client, target.storage.privateBucket), publicStore: createR2Store(client, target.storage.publicBucket) }
}
