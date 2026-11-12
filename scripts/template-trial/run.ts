/**
 * Batch trial runs through the admin's own 「试跑」 (README「模板批量脚本」).
 *
 *   pnpm templates:trial .local/templates/batch.json --dry-run          # what would run, nothing called
 *   pnpm templates:trial .local/templates/batch.json [--only a,b] [--n 3] [--budget 2] [--concurrency 2] [--retry-failed]
 *
 * Test site or a local stack only. Needs what templates:apply needs plus TEMPLATE_TOOLS_R2_* (test
 * photos and results live in the test site's private bucket). Results and the review page go to
 * .local/trials/. Prints ids, versions, outcomes and costs only.
 */
import { writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { listAdminTemplates } from '../../src/core/admin/templates/repository'
import { readBatchFile, RunError, targetStores } from '../template-apply/batch-file'
import { envSchema, localBatchPath, targetOf } from '../template-apply/options'
import { planCells, type Cell } from './cells'
import { buildPage } from './page'
import { ensureTestPhoto, readPhoto } from './photos'
import { readTrialState, recordResults, trialsRoot } from './results'
import { peekCell, runAll, type CellResult, type RunContext } from './runner'
import { summaryTable } from './summary'
import { assertAdmin, effectiveModels, estimates } from './setup'
import { scriptProviders } from './providers'
import { AppError } from '../../src/core/errors'
import { formatTable } from '../template-apply/report'

const USAGE = '用法：pnpm templates:trial .local/<路径>/<批次文件>.json [--dry-run] [--only a,b] [--n 3] [--budget 2] [--concurrency 2] [--retry-failed]'

const flags = z.object({
  only: z.string().optional().transform(v => v ? new Set(v.split(',').map(s => s.trim()).filter(Boolean)) : undefined),
  n: z.coerce.number().int().min(1).max(5).optional(),
  budget: z.coerce.number().positive().max(50).default(2),
  concurrency: z.coerce.number().int().min(1).max(4).default(2),
  'dry-run': z.boolean().default(false),
  'retry-failed': z.boolean().default(false),
})

function readFlags(args: string[]) {
  const string = { type: 'string' } as const
  const { values, positionals } = parseArgs({ args, allowPositionals: true,
    options: { only: string, n: string, budget: string, concurrency: string, 'dry-run': { type: 'boolean' }, 'retry-failed': { type: 'boolean' } } })
  if (positionals.length !== 1) throw new RunError(USAGE)
  const parsed = flags.safeParse(values)
  if (!parsed.success) throw new RunError('参数不对：--n 1～5，--budget 不超过 50（美元），--concurrency 1～4')
  return { ...parsed.data, file: localBatchPath(positionals[0]), dryRun: parsed.data['dry-run'] }
}

async function photoHashes(items: ReturnType<typeof readBatchFile>['templates'], baseDir: string) {
  const photos = new Map<string, { bytes: Uint8Array; hash: string }>()
  for (const input of items.flatMap(item => item.trial?.inputs ?? [])) {
    for (const path of [input.photo, ...Object.values(input.slots ?? {})]) {
      if (path && !photos.has(path)) photos.set(path, await readPhoto(baseDir, path))
    }
  }
  return photos
}

async function dryRun(cells: Cell[], db: RunContext['deps']['db'], target: string) {
  const counts = new Map<string, { done: number; pending: number }>()
  for (const cell of cells) {
    const key = `${cell.templateId} v${cell.version}`
    const count = counts.get(key) ?? { done: 0, pending: 0 }
    count[await peekCell(cell, db)]++
    counts.set(key, count)
  }
  const rows = [...counts].map(([item, c]) => ({ item, ok: true, actions: `已有结果 ${c.done}`, result: `待跑 ${c.pending}` }))
  process.stdout.write(`${target}（dry-run，不调用模型）\n${formatTable(rows)}\n`)
}

type Prepared = Awaited<ReturnType<typeof prepare>>

async function prepare() {
  const options = readFlags(process.argv.slice(2))
  const env = envSchema.safeParse(process.env)
  if (!env.success) throw new RunError(`环境变量缺失或不对：${env.error.issues.map(i => i.path.join('.')).join('、')}`)
  const target = targetOf(env.data)
  const batch = readBatchFile(options.file)
  const baseDir = dirname(options.file)
  const db = createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const templates = new Map((await listAdminTemplates(db)).map(t => [t.id, t]))
  const photos = await photoHashes(batch.templates, baseDir)
  const model = await effectiveModels(db)
  const { cells, problems } = planCells(batch.templates, templates, new Map([...photos].map(([p, v]) => [p, v.hash])), { only: options.only, n: options.n, model })
  for (const p of problems) process.stdout.write(`${p.templateId}: ${p.problem}\n`)
  return { options, env: env.data, target, batch, baseDir, root: trialsRoot(options.file), db, templates, photos, cells, problems }
}

type PrivateStore = NonNullable<Awaited<ReturnType<typeof targetStores>>['privateStore']>

async function uploadPhotos(p: Prepared, deps: { db: Prepared['db']; store: PrivateStore }) {
  const photoIds = new Map<string, string>()
  for (const photo of new Map([...p.photos.values()].map(x => [x.hash, x])).values()) {
    if (p.cells.some(c => c.photoHash === photo.hash || Object.values(c.slotHashes ?? {}).includes(photo.hash))) photoIds.set(photo.hash, await ensureTestPhoto(deps, p.env.SHOTVIVA_IMPORT_ADMIN_ID, photo))
  }
  return photoIds
}

// Ctrl-C: no new cell starts, the running ones finish and everything is recorded; twice exits now.
function onInterrupt(ctx: RunContext) {
  process.on('SIGINT', () => {
    if (ctx.stopped === 'INTERRUPTED') process.exit(130)
    ctx.stopped = 'INTERRUPTED'
    process.stdout.write('\n收到中断：不再开新任务，等正在跑的结束后保存结果（再按一次立即退出；结果仍在数据库里，下次会复用）。\n')
  })
}

const line = (r: CellResult) => `${r.cell.templateId} v${r.cell.version} #${r.cell.inputIndex + 1}.${r.cell.k + 1} ${r.outcome}` +
  `${r.code ? ' ' + r.code : ''}${r.failure?.status ? ` HTTP ${r.failure.status}` : ''}${r.reused ? '（已有）' : ''}\n`

async function finish(p: Prepared, store: PrivateStore, ctx: RunContext, results: CellResult[]) {
  const state = await readTrialState(p.root)
  await recordResults(store, p.root, state, results)
  await writeFile(join(p.root, 'index.html'), buildPage(state, p.batch.templates, p.root, p.baseDir))
  const stopped = ctx.stopped ? `（${ctx.stopped}，已停止开新任务）` : ''
  process.stdout.write(`\n${summaryTable(results)}\n本次预算占用约 $${ctx.spentUsd.toFixed(3)}（有实际成本按实际，否则按估价；没有费用的失败实际不收费，以后台成本对账为准）${stopped}。对照页：${relative(process.cwd(), join(p.root, 'index.html'))}\n`)
  if (results.some(r => r.outcome === 'failed') || p.problems.length) process.exitCode = 1
}

async function main() {
  const p = await prepare()
  if (p.options.dryRun) return dryRun(p.cells, p.db, p.target.name)
  const { privateStore } = await targetStores(p.target)
  if (!privateStore) throw new RunError('缺测试站 R2 密钥（TEMPLATE_TOOLS_R2_*）：测试照片和结果都在测试站的私有桶里，没有调用模型')
  await assertAdmin(p.db, p.env.SHOTVIVA_IMPORT_ADMIN_ID)
  const providers = scriptProviders(p.db)
  const deps = { db: p.db, store: privateStore, provider: providers.provider, identityJudge: await providers.judge() }
  const ctx: RunContext = {
    deps, actorId: p.env.SHOTVIVA_IMPORT_ADMIN_ID, photoIds: await uploadPhotos(p, deps), budgetUsd: p.options.budget,
    spentUsd: 0, reservedUsd: 0, estimateOf: await estimates(p.cells, p.templates, providers.bound), retryFailed: p.options['retry-failed'],
  }
  onInterrupt(ctx)
  await finish(p, privateStore, ctx, await runAll(p.cells, ctx, p.options.concurrency, r => process.stdout.write(line(r))))
}

main().catch((error: unknown) => {
  // Our own messages and error codes only: anything else may carry request detail or a key.
  const text = error instanceof RunError ? error.message : error instanceof AppError ? error.code : 'FAILED'
  process.stderr.write(`${text}\n`)
  process.exitCode = 1
})
