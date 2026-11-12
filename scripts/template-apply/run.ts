/**
 * Batch-applies a local template file through the admin's own functions (README「模板批量脚本」).
 *
 *   pnpm templates:apply .local/templates/batch.json --dry-run   # validate everything, keep nothing
 *   pnpm templates:apply .local/templates/batch.json             # apply on the test site
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SHOTVIVA_IMPORT_ADMIN_ID (.env.local);
 * uploading covers and style references also needs the test site's R2 keys. Prints ids, actions and
 * error codes only. Format: scripts/templates.example.json.
 */
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { createR2Client, createR2Store } from '../../src/core/storage'
import { buildPlan } from './plan'
import { envSchema, readOptions, targetOf, type Env, type Target } from './options'
import type { PlanItem } from './plan-types'
import { batchResultSchema, formatTable, rows, type BatchResult } from './report'
import { parseBatch, type Batch } from './schema'
import { readState } from './state'

class RunError extends Error {}

function readBatchFile(path: string): Batch {
  let input: unknown
  try { input = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new RunError('读不了批次文件（不存在或不是 JSON）') }
  try { return parseBatch(input) } catch (error) { throw new RunError(error instanceof Error ? error.message : '批次文件格式不对') }
}

// The target's own buckets with the R2 keys from .env.local; none on a local stack.
function stores(target: Target) {
  const { R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = process.env
  if (!target.storage || !accountId || !accessKeyId || !secretAccessKey) return {}
  const client = createR2Client({ accountId, accessKeyId, secretAccessKey })
  return { privateStore: createR2Store(client, target.storage.privateBucket), publicStore: createR2Store(client, target.storage.publicBucket) }
}

async function send(db: SupabaseClient, actor: string, plan: PlanItem[], validateOnly: boolean) {
  const items = plan.filter(item => item.problems.length === 0 && item.ops.length > 0).map(({ ref, ops }) => ({ ref, ops }))
  if (items.length === 0) return new Map<string, BatchResult>()
  const { data, error } = await db.rpc('admin_apply_template_batch', { p_actor: actor, p_items: items, p_validate_only: validateOnly })
  // PostgREST detail can echo row values; the code alone is enough to act on.
  if (error?.code === 'PGRST202') throw new RunError('目标库还没有批量接口（迁移 1260），合并并推到这个库之后才能执行')
  if (error?.message === 'NOT_ADMIN') throw new RunError('SHOTVIVA_IMPORT_ADMIN_ID 不是目标站未封禁的管理员')
  if (error) throw new RunError(`批量接口调用失败（${error.code}${/^[A-Z_]+$/.test(error.message) ? ' ' + error.message : ''}）`)
  const parsed = batchResultSchema.safeParse(data)
  if (!parsed.success) throw new RunError('批量接口返回的格式不对（数据库和脚本版本不一致？）')
  return new Map(parsed.data.map(result => [result.ref, result]))
}

const failed = (plan: PlanItem[], results: Map<string, BatchResult>) =>
  plan.some(item => item.problems.length > 0) || [...results.values()].some(result => !result.ok)

// After a real run the test site's catalogue cache expires at once (the T93 sync's revalidate
// route); without its secret the site catches up within the hour.
async function revalidate(target: Target, env: Env) {
  if (!target.site) return '本地库：没有要刷新的网站缓存。'
  if (!env.TEMPLATE_SYNC_REVALIDATE_SECRET) return '没设 TEMPLATE_SYNC_REVALIDATE_SECRET：测试站最多一小时后显示。'
  const response = await fetch(`${target.site}/api/template-sync/revalidate`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.TEMPLATE_SYNC_REVALIDATE_SECRET}` },
  }).catch(() => null)
  return response?.ok ? '测试站目录缓存已刷新。' : `缓存刷新没成功（${response?.status ?? '网络错误'}）：测试站最多一小时后显示。`
}

// Validate everything first (a rolled-back run of the real functions), upload files only once that
// passed, then write. A dry run stops after the first step.
async function apply(batch: Batch, baseDir: string, env: Env, dryRun: boolean) {
  const target = targetOf(env)
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const state = await readState(db, batch)
  const ctx = { baseDir, db, assetsBase: target.assetsBase, ...stores(target) }
  let plan = await buildPlan(batch, state, { ...ctx, write: false })
  let results = await send(db, env.SHOTVIVA_IMPORT_ADMIN_ID, plan, true)
  const checkedOnly = dryRun || failed(plan, results)
  if (!checkedOnly) {
    plan = await buildPlan(batch, state, { ...ctx, write: true })
    results = await send(db, env.SHOTVIVA_IMPORT_ADMIN_ID, plan, false)
  }
  const table = rows(plan, results, checkedOnly)
  process.stdout.write(`${target.name}${dryRun ? '（dry-run，全部回滚）' : ''}\n${formatTable(table)}\n`)
  if (failed(plan, results)) {
    process.stdout.write(`\n${table.filter(row => !row.ok).length} 项有问题，整批没有保留任何改动${checkedOnly && !dryRun ? '，也没有上传文件' : ''}。\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`\n全部${dryRun ? '通过' : '完成'}：${table.length} 项。${dryRun ? '' : await revalidate(target, env)}\n`)
}

async function main() {
  const options = readOptions(process.argv.slice(2))
  const env = envSchema.safeParse(process.env)
  if (!env.success) throw new RunError(`环境变量缺失或不对：${env.error.issues.map(i => i.path.join('.')).join('、')}`)
  return apply(readBatchFile(options.file), dirname(options.file), env.data, options.dryRun)
}

main().catch((error: unknown) => {
  // Our own messages only: a library error may carry request detail or a key.
  const ours = error instanceof RunError || (error instanceof Error && !(error instanceof z.ZodError) && !/https?:\/\/|token|eyJ|secret/i.test(error.message))
  process.stderr.write(`${ours ? (error as Error).message : 'FAILED'}\n`)
  process.exitCode = 1
})
