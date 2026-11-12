/**
 * Batch trial runs through the admin's own 「试跑」 (README「模板批量脚本」).
 *
 *   pnpm templates:trial .local/templates/batch.json --dry-run          # what would run, nothing called
 *   pnpm templates:trial .local/templates/batch.json [--only a,b] [--n 3] [--budget 2] [--concurrency 2]
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
// The two server pieces only: the module's barrel also exports client components.
import { identityJudge } from '../../src/modules/image/edit/classifier-provider'
import { imageProvider } from '../../src/modules/image/provider'
import { readBatchFile, RunError, targetStores } from '../template-apply/batch-file'
import { envSchema, localBatchPath, targetOf } from '../template-apply/options'
import { planCells, type Cell } from './cells'
import { buildPage } from './page'
import { ensureTestPhoto, readPhoto } from './photos'
import { readTrialState, recordResults, trialsRoot } from './results'
import { peekCell, runAll, type CellResult, type RunContext } from './runner'
import { summaryTable } from './summary'
import { formatTable } from '../template-apply/report'

const USAGE = '用法：pnpm templates:trial .local/<路径>/<批次文件>.json [--dry-run] [--only a,b] [--n 3] [--budget 2] [--concurrency 2]'

const flags = z.object({
  only: z.string().optional().transform(v => v ? new Set(v.split(',').map(s => s.trim()).filter(Boolean)) : undefined),
  n: z.coerce.number().int().min(1).max(5).optional(),
  budget: z.coerce.number().positive().max(50).default(2),
  concurrency: z.coerce.number().int().min(1).max(4).default(2),
  'dry-run': z.boolean().default(false),
})

function readFlags(args: string[]) {
  const string = { type: 'string' } as const
  const { values, positionals } = parseArgs({ args, allowPositionals: true,
    options: { only: string, n: string, budget: string, concurrency: string, 'dry-run': { type: 'boolean' } } })
  if (positionals.length !== 1) throw new RunError(USAGE)
  const parsed = flags.safeParse(values)
  if (!parsed.success) throw new RunError('参数不对：--n 1～5，--budget 不超过 50（美元），--concurrency 1～4')
  return { ...parsed.data, file: localBatchPath(positionals[0]), dryRun: parsed.data['dry-run'] }
}

async function photoHashes(items: ReturnType<typeof readBatchFile>['templates'], baseDir: string) {
  const photos = new Map<string, { bytes: Uint8Array; hash: string }>()
  for (const input of items.flatMap(item => item.trial?.inputs ?? [])) {
    if (input.photo && !photos.has(input.photo)) photos.set(input.photo, await readPhoto(baseDir, input.photo))
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

async function main() {
  const options = readFlags(process.argv.slice(2))
  const extra = options
  const env = envSchema.safeParse(process.env)
  if (!env.success) throw new RunError(`环境变量缺失或不对：${env.error.issues.map(i => i.path.join('.')).join('、')}`)
  const target = targetOf(env.data)
  const batch = readBatchFile(options.file)
  const baseDir = dirname(options.file)
  const root = trialsRoot(options.file)
  const db = createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const templates = new Map((await listAdminTemplates(db)).map(t => [t.id, t]))
  const photos = await photoHashes(batch.templates, baseDir)
  const { cells, problems } = planCells(batch.templates, templates, new Map([...photos].map(([p, v]) => [p, v.hash])), { only: extra.only, n: extra.n })
  for (const p of problems) process.stdout.write(`${p.templateId}: ${p.problem}\n`)
  if (options.dryRun) return dryRun(cells, db, target.name)
  const { privateStore } = await targetStores(target)
  if (!privateStore) throw new RunError('缺测试站 R2 密钥（TEMPLATE_TOOLS_R2_*）：测试照片和结果都在测试站的私有桶里，没有调用模型')
  const actorId = env.data.SHOTVIVA_IMPORT_ADMIN_ID
  const deps = { db, store: privateStore, provider: imageProvider, identityJudge: await identityJudge() }
  const photoIds = new Map<string, string>()
  for (const photo of new Map([...photos.values()].map(p => [p.hash, p])).values()) {
    if (cells.some(c => c.photoHash === photo.hash)) photoIds.set(photo.hash, await ensureTestPhoto(deps, actorId, photo))
  }
  const ctx: RunContext = { deps, actorId, photoIds, budgetUsd: extra.budget, spentUsd: 0 }
  const results: CellResult[] = await runAll(cells, ctx, extra.concurrency,
    r => process.stdout.write(`${r.cell.templateId} v${r.cell.version} #${r.cell.inputIndex + 1}.${r.cell.k + 1} ${r.outcome}${r.code ? ' ' + r.code : ''}${r.reused ? '（已有）' : ''}\n`))
  const state = await readTrialState(root)
  await recordResults(privateStore, root, state, results)
  await writeFile(join(root, 'index.html'), buildPage(state, batch.templates, root, baseDir))
  process.stdout.write(`\n${summaryTable(results)}\n本次花费约 $${ctx.spentUsd.toFixed(3)}${ctx.stopped ? `（${ctx.stopped}，已停止开新任务）` : ''}。对照页：${relative(process.cwd(), join(root, 'index.html'))}\n`)
  if (results.some(r => r.outcome === 'failed') || problems.length) process.exitCode = 1
}

main().catch((error: unknown) => {
  const ours = error instanceof RunError || (error instanceof Error && !(error instanceof z.ZodError) && !/https?:\/\/|token|eyJ|secret/i.test(error.message))
  process.stderr.write(`${ours ? (error as Error).message : 'FAILED'}\n`)
  process.exitCode = 1
})
