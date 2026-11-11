/**
 * Batch-applies a local template file through the admin's own functions (README「模板批量脚本」).
 *
 *   pnpm templates:apply .local/templates/batch.json --dry-run   # validate everything, keep nothing
 *   pnpm templates:apply .local/templates/batch.json             # apply on the test site
 *   pnpm templates:apply .local/templates/batch.json --production-batch
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SHOTVIVA_IMPORT_ADMIN_ID (.env.local);
 * covers and style references also need the R2 keys and NEXT_PUBLIC_ASSETS_BASE_URL. Prints ids,
 * actions and error codes only. Format: scripts/templates.example.json.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { r2PublicStore, r2Store } from '../../src/core/storage'
import { buildPlan } from './plan'
import { decodeProductionBatch, encodeBatch } from './production'
import { envSchema, readOptions, targetOf, USAGE, type Env } from './options'
import type { PlanItem } from './plan-types'
import { batchResultSchema, formatTable, rows, type BatchResult } from './report'
import { parseBatch, type Batch } from './schema'
import { readState } from './state'

function readBatchFile(path: string): Batch {
  let input: unknown
  try { input = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error(`读不了 ${path}（不存在或不是 JSON）`) }
  return parseBatch(input)
}

const optionalStore = (make: () => ReturnType<typeof r2Store>) => { try { return make() } catch { return undefined } }

async function send(db: SupabaseClient, actor: string, plan: PlanItem[], dryRun: boolean) {
  const items = plan.filter(item => item.problems.length === 0 && item.ops.length > 0).map(({ ref, ops }) => ({ ref, ops }))
  if (items.length === 0) return new Map<string, BatchResult>()
  const { data, error } = await db.rpc('admin_apply_template_batch', { p_actor: actor, p_items: items, p_validate_only: dryRun })
  // PostgREST detail can echo row values; the code alone is enough to act on.
  if (error) throw new Error(error.message === 'NOT_ADMIN' ? 'SHOTVIVA_IMPORT_ADMIN_ID 不是目标站未封禁的管理员' : `批量接口调用失败（${error.code}）`)
  return new Map(batchResultSchema.parse(data).map(result => [result.ref, result]))
}

async function apply(batch: Batch, baseDir: string, env: Env, dryRun: boolean) {
  const target = targetOf(env)
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const state = await readState(db, batch)
  const assets = target === 'production' ? {} : {
    assetsBase: env.NEXT_PUBLIC_ASSETS_BASE_URL, privateStore: optionalStore(r2Store), publicStore: optionalStore(r2PublicStore),
  }
  const ctx = { baseDir, db, ...assets }
  let plan = await buildPlan(batch, state, { ...ctx, write: false })
  // Files are uploaded only for items that passed every local check.
  if (!dryRun) plan = await buildPlan(batch, state, { ...ctx, write: true, skip: new Set(plan.filter(i => i.problems.length).map(i => i.ref)) })
  const results = await send(db, env.SHOTVIVA_IMPORT_ADMIN_ID, plan, dryRun)
  const table = rows(plan, results, dryRun)
  process.stdout.write(`${target}${dryRun ? '（dry-run，全部回滚）' : ''}\n${formatTable(table)}\n`)
  const failed = table.filter(row => !row.ok).length
  process.stdout.write(failed ? `\n${failed} 项失败。\n` : `\n全部${dryRun ? '通过' : '完成'}：${table.length} 项。前台目录缓存最多 1 小时后更新。\n`)
  if (failed) process.exitCode = 1
}

async function main() {
  const options = readOptions(process.argv.slice(2))
  if (options.productionBatch) {
    if (!options.file) throw new Error(USAGE)
    process.stdout.write(`${encodeBatch(readBatchFile(resolve(options.file)))}\n`)
    return
  }
  const env = envSchema.parse(process.env)
  if (env.TEMPLATE_APPLY_TARGET === 'production') {
    if (!env.TEMPLATE_APPLY_BATCH) throw new Error('TEMPLATE_APPLY_BATCH is required')
    return apply(decodeProductionBatch(env.TEMPLATE_APPLY_BATCH), process.cwd(), env, options.dryRun)
  }
  if (!options.file) throw new Error(USAGE)
  const path = resolve(options.file)
  return apply(readBatchFile(path), dirname(path), env, options.dryRun)
}

main().catch((error: unknown) => {
  // Our own messages only: a thrown library error may carry request detail.
  const text = error instanceof z.ZodError ? `环境变量缺失或不对：${error.issues.map(i => i.path.join('.')).join('、')}`
    : error instanceof Error && !/https?:\/\/|token|eyJ/i.test(error.message) ? error.message : 'FAILED'
  process.stderr.write(`${text}\n`)
  process.exitCode = 1
})
