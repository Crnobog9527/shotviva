/**
 * The last steps of the template pipeline (README「模板批量脚本」), test site only:
 *
 *   pnpm templates:review   .local/templates/batch.json   # refresh the review page, list what to review
 *   pnpm templates:finalize .local/templates/batch.json [--dry-run]   # passed reviews → cover, sale, publish
 *   pnpm templates:status   .local/templates/batch.json   # where each template stands, versions, spend
 *
 * review and status only read. finalize goes through templates:apply (validate, then write all or
 * nothing). Prints ids, versions, stages and costs only.
 */
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'

import { AppError } from '../../src/core/errors'
import { applyBatch } from '../template-apply/apply'
import { readBatchFile, RunError, targetStores } from '../template-apply/batch-file'
import { envSchema, localBatchPath, targetOf } from '../template-apply/options'
import { formatTable } from '../template-apply/report'
import { buildPage } from '../template-trial/page'
import { readTrialState, trialsRoot } from '../template-trial/results'
import { readProgress } from './progress'
import { missingPicks } from './picks'
import { finalizeBatch, reviewState, spentUsd, stageOf } from './stages'
import { readSyncRuns, syncState } from './sync-status'

const COMMANDS = ['review', 'finalize', 'status'] as const
type Command = (typeof COMMANDS)[number]

function readArgs(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { 'dry-run': { type: 'boolean' } } })
  const [command, file] = positionals
  if (!COMMANDS.includes(command as Command) || !file || positionals.length !== 2) {
    throw new RunError('用法：pnpm templates:review|templates:finalize|templates:status .local/<路径>/<批次文件>.json [--dry-run]')
  }
  return { command: command as Command, file: localBatchPath(file), dryRun: values['dry-run'] === true }
}

async function load(file: string) {
  const env = envSchema.safeParse(process.env)
  if (!env.success) throw new RunError(`环境变量缺失或不对：${env.error.issues.map(i => i.path.join('.')).join('、')}`)
  const target = targetOf(env.data)
  const batch = readBatchFile(file)
  const db = createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return { env: env.data, target, batch, progress: await readProgress(db, batch.templates.map(t => t.id)) }
}

type Loaded = Awaited<ReturnType<typeof load>>

const REVIEW_LABEL = { none: '待评审', pass: '通过', fail: '不通过', stale: '评审已过期' }

async function review(file: string, { batch, progress }: Loaded) {
  const root = trialsRoot(file)
  if (existsSync(join(root, 'state.json'))) {
    await writeFile(join(root, 'index.html'), buildPage(await readTrialState(root), batch.templates, root, dirname(file)))
  }
  const rows = batch.templates.map(item => {
    const p = progress.get(item.id)!
    const current = p.runs.filter(run => run.promptVersion === p.version && run.status === 'succeeded')
    const state = reviewState(item, p.version)
    return { item: item.id, ok: state !== 'fail', actions: `v${p.version ?? '-'} · 当前版本结果 ${current.length} 张`, result: REVIEW_LABEL[state] }
  })
  process.stdout.write(`${formatTable(rows)}\n对照页：${relative(process.cwd(), join(root, 'index.html'))}\n`)
}

async function status({ batch, progress }: Loaded) {
  const runs = await readSyncRuns()
  const rows = batch.templates.map(item => {
    const p = progress.get(item.id)!
    const current = p.runs.filter(run => run.promptVersion === p.version)
    const ok = current.filter(run => run.status === 'succeeded').length
    const sync = p.exists ? syncState(item.id, p.seriesSlug ?? null, p.changedAt ?? null, runs) : '未同步'
    return { item: item.id, ok: true, actions: stageOf(item, p),
      result: `v${p.version ?? '-'} · 试跑 ${p.runs.length} 次（当前版本成功 ${ok}/${current.length}）· $${spentUsd(p.runs).toFixed(3)} · 正式站：${sync}` }
  })
  const total = [...progress.values()].reduce((sum, p) => sum + spentUsd(p.runs), 0)
  process.stdout.write(`${formatTable(rows)}\n这批模板的试跑累计花费 $${total.toFixed(3)}（只算已核实的成本）。\n`)
  process.stdout.write(runs ? '正式站同步状态来自 GitHub 上「Sync preview templates to production」的成功运行（按模板 id 和系列 slug 匹配），不读正式库。\n'
    : '正式站同步状态无法确认：读不到 GitHub 上的同步运行记录（gh 没登录或网络不通）。\n')
}

async function finalize(file: string, loaded: Loaded, dryRun: boolean) {
  const { batch, problems, skipped } = finalizeBatch(loaded.batch, loaded.progress)
  for (const line of skipped) process.stdout.write(`跳过 ${line}\n`)
  const ids = batch.templates.map(t => t.id)
  const { privateStore } = await targetStores(loaded.target)
  if (ids.length && !privateStore) throw new RunError('缺测试站 R2 密钥（TEMPLATE_TOOLS_R2_*）：无法确认选中的试跑图片还在，也无法设封面')
  if (privateStore) problems.push(...await missingPicks(loaded.batch, loaded.progress, ids, privateStore))
  if (problems.length) {
    for (const p of problems) process.stdout.write(`${p.templateId}：${p.problem}\n`)
    throw new RunError(`${problems.length} 个模板的评审有问题，这批没有定稿任何模板`)
  }
  if (batch.templates.length === 0) { process.stdout.write('没有评审通过、可以定稿的模板。\n'); return }
  await applyBatch(batch, dirname(file), loaded.env, dryRun)
  // Owner: publication follows the test site, so the next T93 sync takes these live on production.
  // This command never starts a sync.
  const live = batch.templates.filter(t => t.publish !== false).map(t => t.id)
  if (!process.exitCode && live.length) {
    process.stdout.write(`${dryRun ? '（dry-run）真实定稿后，' : ''}这些模板会在下一次同步时上正式站：${live.join(', ')}\n`)
  }
}

async function main() {
  const args = readArgs(process.argv.slice(2))
  const loaded = await load(args.file)
  process.stdout.write(`${loaded.target.name}\n`)
  if (args.command === 'review') return review(args.file, loaded)
  if (args.command === 'status') return status(loaded)
  return finalize(args.file, loaded, args.dryRun)
}

main().catch((error: unknown) => {
  // Our own messages and error codes only: anything else may carry request detail or a key.
  process.stderr.write(`${error instanceof RunError ? error.message : error instanceof AppError ? error.code : 'FAILED'}\n`)
  process.exitCode = 1
})
