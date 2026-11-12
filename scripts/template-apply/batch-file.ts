import { readFileSync } from 'node:fs'

import { HeadBucketCommand } from '@aws-sdk/client-s3'

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

// A production bucket the tool's token must not reach. A token that can is too broad: these tools
// only ever write the test site's two buckets, so they refuse to run with it.
export const PRODUCTION_BUCKET = 'shotviva-assets'

type Sender = { send: (command: HeadBucketCommand) => Promise<unknown> }

export async function assertTestOnlyToken(client: Sender): Promise<void> {
  let reachable: boolean
  try {
    await client.send(new HeadBucketCommand({ Bucket: PRODUCTION_BUCKET }))
    reachable = true
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status !== 403 && status !== 404) throw new RunError('连不上 R2，无法确认 TEMPLATE_TOOLS_R2_* 令牌的范围，停止')
    reachable = false
  }
  if (reachable) throw new RunError(`TEMPLATE_TOOLS_R2_* 的令牌能访问正式站的桶 ${PRODUCTION_BUCKET}：范围给大了，请改成只限 shotviva-preview 和 shotviva-assets-preview`)
}

// The target's own buckets with this tool's R2 keys: TEMPLATE_TOOLS_R2_*, never the shell's R2_*
// (Node's --env-file does not override variables the shell already has, and those may belong to
// another project). None on a local stack, or without the keys. The token is checked first.
export async function targetStores(target: Target, env: Record<string, string | undefined> = process.env) {
  const accountId = env.TEMPLATE_TOOLS_R2_ACCOUNT_ID
  const accessKeyId = env.TEMPLATE_TOOLS_R2_ACCESS_KEY_ID
  const secretAccessKey = env.TEMPLATE_TOOLS_R2_SECRET_ACCESS_KEY
  if (!target.storage || !accountId || !accessKeyId || !secretAccessKey) return {}
  const client = createR2Client({ accountId, accessKeyId, secretAccessKey })
  await assertTestOnlyToken(client)
  return { privateStore: createR2Store(client, target.storage.privateBucket), publicStore: createR2Store(client, target.storage.publicBucket) }
}
