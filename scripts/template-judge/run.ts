/**
 * The automatic image judge for trial results (README「模板批量脚本」):
 *
 *   pnpm templates:judge .local/templates/batch.json --dry-run       # what would be judged, nothing called
 *   pnpm templates:judge .local/templates/batch.json [--only a,b] [--budget 0.2] [--concurrency 2] [--effort low|medium|high] [--rejudge-failed]
 *
 * --rejudge-failed: a result whose verdict has a ✗ from the model is judged once more (once per
 * result, ever: the second verdict is kept beside the first). It counts as failed only if both fail.
 *
 * Judges every result of the current prompt version that templates:trial downloaded
 * (.local/trials/state.json) against the batch file's checklist (`judge.bar`, a template's
 * `judge`, an input set's `judge`), looking at the images: the result, the test image(s) it was
 * made from, the template's cover and its style references. Alpha and QR codes are checked on the
 * pixels without a model. The model is the admin's judge line (the active 'decision' provider),
 * its key read from the database as the admin does. Test site or a local stack only. Verdicts and
 * spend go to .local/trials/judge.json; an unchanged result is never judged twice. Prints ids,
 * verdicts and costs only.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { listAdminTemplates } from '../../src/core/admin/templates/repository'
import { AppError } from '../../src/core/errors'
import { effectivePrices, providerTag } from '../../src/core/jobs'
import { readProviderKey } from '../../src/core/providers'
import { loadActiveProviderRow } from '../../src/core/providers/repository'
import { withDbTiers } from '../../src/core/templates/db-resolution'
import { readBatchFile, RunError, targetStores } from '../template-apply/batch-file'
import { envSchema, localBatchPath, targetOf } from '../template-apply/options'
import { formatTable } from '../template-apply/report'
import { planCells } from '../template-trial/cells'
import { buildPage } from '../template-trial/page'
import { photoHashes } from '../template-trial/photos'
import { readTrialState, trialsRoot } from '../template-trial/results'
import { effectiveModels } from '../template-trial/setup'
import { jobHash, judgeAll, judgeModelKey, planJobs, type ImageReader, type Job, type JobResult, type JudgeContext } from './judge'
import { latestByRun, readLedger, rejudgeHash, writeLedger, type Verdict } from './ledger'
import { lockLedger } from './lock'
import { DEFAULT_EFFORT, EFFORTS, judgeEstimateUsd, type JudgeLine } from './model'

const USAGE = '用法：pnpm templates:judge .local/<路径>/<批次文件>.json [--dry-run] [--only a,b] [--budget 0.2] [--concurrency 2] [--effort medium] [--rejudge-failed]'

const flags = z.object({
  only: z.string().optional().transform(v => v ? new Set(v.split(',').map(s => s.trim()).filter(Boolean)) : undefined),
  budget: z.coerce.number().positive().max(5).default(0.2),
  effort: z.enum(EFFORTS).default(DEFAULT_EFFORT),
  'rejudge-failed': z.boolean().default(false),
  concurrency: z.coerce.number().int().min(1).max(4).default(2),
  'dry-run': z.boolean().default(false),
})

function readFlags(args: string[]) {
  const string = { type: 'string' } as const
  const { values, positionals } = parseArgs({ args, allowPositionals: true,
    options: { only: string, budget: string, concurrency: string, effort: string, 'dry-run': { type: 'boolean' }, 'rejudge-failed': { type: 'boolean' } } })
  if (positionals.length !== 1) throw new RunError(USAGE)
  const parsed = flags.safeParse(values)
  if (!parsed.success) throw new RunError('参数不对：--budget 不超过 5（美元），--concurrency 1～4，--effort low|medium|high')
  return { ...parsed.data, file: localBatchPath(positionals[0]), dryRun: parsed.data['dry-run'] }
}

// The judge line without its key (dry-run needs only its tag and prices); the key is read from
// Vault, as the admin does, only when a look is about to be made.
async function judgeRow(db: SupabaseClient) {
  const row = await loadActiveProviderRow(db, 'decision')
  if (!row) throw new RunError('目标站没有启用的判断线路（后台 /admin/providers 的「判断」），没有调用模型')
  if (row.adapter !== 'openai_responses') throw new RunError(`判断线路的适配器 ${row.adapter} 不是 Responses 接口，评审机用不了`)
  return { row, tag: providerTag(row.id, row.model), prices: effectivePrices(row.model, row.prices) }
}

const MAX_COVER_BYTES = 20 * 1024 * 1024

async function fetchCover(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('JUDGE_COVER_UNAVAILABLE')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length === 0 || bytes.length > MAX_COVER_BYTES) throw new Error('JUDGE_COVER_UNAVAILABLE')
  return bytes
}

async function prepare() {
  const options = readFlags(process.argv.slice(2))
  // Reads only and writes nothing to the database, so it needs no acting admin.
  const env = envSchema.omit({ SHOTVIVA_IMPORT_ADMIN_ID: true }).safeParse(process.env)
  if (!env.success) throw new RunError(`环境变量缺失或不对：${env.error.issues.map(i => i.path.join('.')).join('、')}`)
  const target = targetOf(env.data)
  const batch = readBatchFile(options.file)
  const baseDir = dirname(options.file)
  const root = trialsRoot(options.file)
  const db = createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: withDbTiers() } })
  const templates = new Map((await listAdminTemplates(db)).map(t => [t.id, t]))
  const photos = await photoHashes(batch.templates, baseDir)
  const { cells, problems } = planCells(batch.templates, templates, new Map([...photos].map(([p, v]) => [p, v.hash])), { only: options.only, model: await effectiveModels(db) })
  for (const p of problems) process.stdout.write(`${p.templateId}: ${p.problem}\n`)
  const state = await readTrialState(root)
  const judged = new Map([...templates].map(([id, t]) => [id, { coverAfterUrl: t.coverAfterUrl, styleRefs: t.prompt?.styleRefs.map(r => r.key) ?? [], modelParams: t.prompt?.modelParams ?? {} }]))
  const planned = planJobs(batch, cells, state, judged)
  const unchecked = batch.templates.filter(item => item.trial && (!options.only || options.only.has(item.id)) && !batch.judge?.bar.length && !item.judge?.bar?.length).map(item => item.id)
  if (unchecked.length) process.stdout.write(`没有评审清单（批次文件的 judge.bar 或模板的 judge.bar），只做透明度/二维码检查：${unchecked.join(', ')}\n`)
  return { options, env: env.data, target, batch, baseDir, root, db, state, planned, problems }
}

type Prepared = Awaited<ReturnType<typeof prepare>>

// Absolute paths, and the style references dropped when this machine cannot read the test bucket.
async function withHashes(p: Prepared, tag: string, refsReadable: boolean): Promise<Job[]> {
  const jobs: Job[] = []
  for (const planned of p.planned.jobs) {
    const sources = { ...planned.sources, result: join(p.root, planned.sources.result),
      inputs: planned.sources.inputs.map(input => ({ ...input, path: resolve(p.baseDir, input.path) })), refs: refsReadable ? planned.sources.refs : [] }
    const bytes = new Uint8Array(await readFile(sources.result).catch(() => { throw new RunError(`试跑结果文件不见了：${planned.sources.result}（重跑 templates:trial 会重新下载）`) }))
    jobs.push({ ...planned, sources, hash: jobHash(bytes, planned.cell, sources, planned.checklist, tag) })
  }
  return jobs
}

const mark = (pass: boolean) => pass ? '✓' : '✗'

const failedLines = (verdict: Verdict) => verdict.items.filter(item => !item.pass).map(item => `    ✗ ${item.id}. ${item.text}\n      ${item.reason}\n`).join('')
const score = (verdict: Verdict) => `${mark(verdict.pass)} ${verdict.items.filter(item => item.pass).length}/${verdict.items.length}`

function line(r: JobResult) {
  const { cell } = r.job
  const head = `${cell.templateId} v${cell.version} #${cell.inputIndex + 1}.${cell.k + 1}`
  if (!r.verdict) return `${head} ${r.outcome} ${r.code ?? ''}\n`
  const first = `${head} ${score(r.verdict)}${r.outcome === 'reused' ? '（已判过）' : ''}\n${failedLines(r.verdict)}`
  if (r.rejudge) {
    const label = r.rejudge.pass ? '复判通过' : '两次都不过'
    return `${first}  复判 ${score(r.rejudge)}（${label}${r.rejudgeReused ? '，已判过' : ''}）\n${failedLines(r.rejudge)}`
  }
  return r.rejudgeCode ? `${first}  复判没做：${r.rejudgeCode}\n` : first
}

function dryRun(p: Prepared, jobs: Job[], ledger: Awaited<ReturnType<typeof readLedger>>, prices: JudgeLine['prices'], rejudgeFailed: boolean) {
  const rows = new Map<string, { cached: number; pending: number; usd: number }>()
  for (const job of jobs) {
    const key = `${job.cell.templateId} v${job.cell.version}`
    const row = rows.get(key) ?? { cached: 0, pending: 0, usd: 0 }
    const cached = ledger.verdicts[job.hash]
    // With --rejudge-failed, a stored ✗ from the model without its second look is one more look.
    const second = rejudgeFailed && cached && !cached.pass && cached.items.some(item => item.source === 'model' && !item.pass) && !ledger.verdicts[rejudgeHash(cached.hash)]
    if (cached && !second) row.cached++
    else {
      row.pending++
      if (job.checklist.items.length) row.usd += judgeEstimateUsd(1 + job.sources.inputs.length + (job.sources.cover ? 1 : 0) + job.sources.refs.length, prices) ?? Number.NaN
    }
    rows.set(key, row)
  }
  const table = [...rows].map(([item, r]) => ({ item, ok: true, actions: `已判 ${r.cached}`, result: `待判 ${r.pending} · 预留上限约 $${r.usd.toFixed(4)}` }))
  const missing = p.planned.missing.length ? `\n当前版本还有 ${p.planned.missing.length} 张没有本机结果（先跑 templates:trial）。` : ''
  process.stdout.write(`${p.target.name}（dry-run，不调用模型）\n${formatTable(table)}${missing}\n`)
}

async function main() {
  const p = await prepare()
  const judge = await judgeRow(p.db)
  const { privateStore } = await targetStores(p.target)
  if (!privateStore && p.planned.jobs.some(job => job.sources.refs.length)) process.stdout.write('没有测试站 R2 密钥（TEMPLATE_TOOLS_R2_*）：这次不给评审机看画风参考图。\n')
  // The effort changes the answer, so it is part of the model a verdict is reused for.
  const model = judgeModelKey(judge.tag, p.options.effort)
  const jobs = await withHashes(p, model, Boolean(privateStore))
  if (p.options.dryRun) return dryRun(p, jobs, await readLedger(p.root), judge.prices, p.options['rejudge-failed'])
  // Held from reading the ledger until it is written back: two runs on the same .local/trials
  // would otherwise pay for the same results and the last writer would drop the other's spend.
  const unlock = await lockLedger(p.root)
  try {
    await judgeRun(p, judge, privateStore, jobs, model)
  } finally {
    await unlock()
  }
}

async function judgeRun(p: Prepared, judge: Awaited<ReturnType<typeof judgeRow>>, privateStore: Awaited<ReturnType<typeof targetStores>>['privateStore'],
  jobs: Job[], model: string) {
  const ledger = await readLedger(p.root)
  if (judgeEstimateUsd(1, judge.prices) === null) throw new RunError('判断线路没填价格（后台 /admin/providers），无法预留预算，没有调用模型')
  const apiKey = await readProviderKey(p.db, judge.row.id)
  if (!apiKey) throw new RunError('判断线路没有密钥，没有调用模型')
  const images: ImageReader = {
    file: async path => new Uint8Array(await readFile(path)),
    cover: fetchCover,
    ref: async key => { if (!privateStore) throw new Error('JUDGE_REFS_UNAVAILABLE'); return privateStore.get(key) },
  }
  const ctx: JudgeContext = { line: { tag: model, effort: p.options.effort, prices: judge.prices, config: { apiKey, model: judge.row.model, baseUrl: judge.row.baseUrl } },
    images, ledger, budgetUsd: p.options.budget, spentUsd: 0, reservedUsd: 0, rejudgeFailed: p.options['rejudge-failed'] }
  process.on('SIGINT', () => {
    if (ctx.stopped === 'INTERRUPTED') process.exit(130)
    ctx.stopped = 'INTERRUPTED'
    process.stdout.write('\n收到中断：不再开新的评审，等正在跑的结束后保存（再按一次立即退出）。\n')
  })
  const results = await judgeAll(jobs, ctx, p.options.concurrency, r => process.stdout.write(line(r)))
  await writeLedger(p.root, ledger)
  await writeFile(join(p.root, 'index.html'), buildPage(p.state, p.batch.templates, p.root, p.baseDir, new Date(), latestByRun(ledger)))
  const count = (outcome: JobResult['outcome']) => results.filter(r => r.outcome === outcome).length
  const passed = results.filter(r => r.verdict?.pass || r.rejudge?.pass).length
  const rejudged = results.filter(r => r.rejudge)
  const second = rejudged.length ? `；复判 ${rejudged.length} 张，复判通过 ${rejudged.filter(r => r.rejudge!.pass).length}，两次都不过 ${rejudged.filter(r => !r.rejudge!.pass).length}` : ''
  process.stdout.write(`\n评审 ${results.length} 张：通过 ${passed}，不通过 ${results.filter(r => r.verdict && !r.verdict.pass && !r.rejudge?.pass).length}${second}` +
    `（新判 ${count('judged')}，已判过 ${count('reused')}，失败 ${count('failed')}，跳过 ${count('skipped')}）。` +
    `本次花费约 $${ctx.spentUsd.toFixed(4)}（${judge.tag}，按回传 token 计价；失败的按预留额计）。对照页：${relative(process.cwd(), join(p.root, 'index.html'))}\n`)
  if (count('failed') || count('skipped') || results.some(r => r.rejudgeCode) || p.problems.length) process.exitCode = 1
}

main().catch((error: unknown) => {
  // Our own messages and error codes only: anything else may carry request detail or a key.
  const text = error instanceof RunError ? error.message : error instanceof AppError ? error.code : 'FAILED'
  process.stderr.write(`${text}\n`)
  process.exitCode = 1
})
