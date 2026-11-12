import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { RunError, targetStores } from './batch-file'
import { buildPlan } from './plan'
import { targetOf, type Env, type Target } from './options'
import type { PlanItem } from './plan-types'
import { batchResultSchema, formatTable, rows, type BatchResult } from './report'
import type { Batch } from './schema'
import { readState } from './state'

// Applying a batch, shared by templates:apply and templates:finalize (which builds its batch from
// the reviews): plan, validate everything in a rolled-back run of the real functions, upload files
// only once that passed, then write all or nothing.

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
export async function applyBatch(batch: Batch, baseDir: string, env: Env, dryRun: boolean) {
  const target = targetOf(env)
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const state = await readState(db, batch)
  const ctx = { baseDir, db, assetsBase: target.assetsBase, ...(await targetStores(target)) }
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

