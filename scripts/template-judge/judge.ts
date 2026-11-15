import { createHash } from 'node:crypto'

import type { Batch, TemplateItem } from '../template-apply/schema'
import { digest, MAX_ATTEMPTS, runIdOf, type Cell } from '../template-trial/cells'
import type { TrialRecord, TrialState } from '../template-trial/results'
import { checklistFor, type Checklist } from './checklist'
import { lineUsd, rejudgeHash, type JudgeLedger, type Verdict, type VerdictItem } from './ledger'
import { askJudge, judgeEstimateUsd, SKELETON_VERSION, type Effort, type JudgeImage, type JudgeLine } from './model'
import { alphaCheck, qrCheck, readQr, type PixelVerdict } from './pixels'

// Judging the trial results of a batch: which results there are (the current prompt version's
// cells, matched to state.json by run id), what each is judged on, the content hash that makes a
// repeat free, and the run itself under a budget held per call like templates:trial's.

export type Job = {
  cell: Cell
  record: TrialRecord
  item: TemplateItem
  checklist: Checklist
  // Where the images come from; read when the job runs.
  sources: JudgeSources
  hash: string
}

// result: a file under .local/trials; inputs: batch-relative test images (label = slot); cover:
// the template's public after-cover URL; refs: style-reference keys in the test site's bucket.
export type JudgeSources = { result: string; inputs: { label: string; path: string }[]; cover: string | null; refs: string[] }

export type ImageReader = {
  file: (path: string) => Promise<Uint8Array>
  cover: (url: string) => Promise<Uint8Array>
  ref: (key: string) => Promise<Uint8Array>
}

export const MAX_REFS = 2

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

// The succeeded, downloaded result of a cell, on any attempt.
export function recordOf(cell: Cell, state: TrialState): TrialRecord | null {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const record = state.records[runIdOf(cell, attempt)]
    if (record?.outcome === 'succeeded' && record.file) return record
  }
  return null
}

export function sourcesOf(cell: Cell, record: TrialRecord, template: { coverAfterUrl: string | null; styleRefs: string[] }): JudgeSources {
  const input = cell.input
  const inputs = input.photo ? [{ label: 'photo', path: input.photo }] : Object.entries(input.slots ?? {}).map(([label, path]) => ({ label, path }))
  const cover = template.coverAfterUrl?.startsWith('https://') ? template.coverAfterUrl : null
  return { result: record.file!, inputs, cover, refs: template.styleRefs.slice(0, MAX_REFS) }
}

// Everything that changes the verdict: the result's bytes, the inputs (by their trial hashes), the
// cover and references (their names are content-derived), the checklist, the judge model and the
// skeleton version.
export function jobHash(resultBytes: Uint8Array, cell: Cell, sources: JudgeSources, checklist: Checklist, model: string) {
  return digest({ skeleton: SKELETON_VERSION, model, checklist, result: sha(resultBytes),
    inputs: { photo: cell.photoHash, slots: cell.slotHashes }, cover: sources.cover, refs: sources.refs })
}

// The judge model a verdict is reused for: the line and the effort (the effort changes the answer).
export const judgeModelKey = (tag: string, effort: Effort) => `${tag}@${effort}`

export type PlannedJob = Omit<Job, 'hash'>

// One job per current cell that has a result on this machine. Cells without one are counted so the
// command can say what is missing.
export function planJobs(batch: Batch, cells: Cell[], state: TrialState,
  templates: Map<string, { coverAfterUrl: string | null; styleRefs: string[]; modelParams: Record<string, unknown> }>) {
  const items = new Map(batch.templates.map(item => [item.id, item]))
  const jobs: PlannedJob[] = []
  const missing: Cell[] = []
  for (const cell of cells) {
    const item = items.get(cell.templateId)
    const template = templates.get(cell.templateId)
    const record = recordOf(cell, state)
    if (!item || !template || !record) { missing.push(cell); continue }
    const checklist = checklistFor(batch.judge, item.judge, cell.input, template.modelParams)
    jobs.push({ cell, record, item, checklist, sources: sourcesOf(cell, record, template) })
  }
  return { jobs, missing }
}

export type JudgeContext = {
  line: JudgeLine
  images: ImageReader
  ledger: JudgeLedger
  budgetUsd: number
  spentUsd: number
  reservedUsd: number
  stopped?: string
  // --rejudge-failed: a verdict with a ✗ from the model gets one second look, kept beside it.
  rejudgeFailed?: boolean
  now?: () => string
  sleep?: (ms: number) => Promise<void>
}

export type JobResult = {
  job: Job; outcome: 'judged' | 'reused' | 'failed' | 'skipped'; verdict?: Verdict; code?: string
  // The second look (--rejudge-failed), and why there is none when one was due.
  rejudge?: Verdict; rejudgeCode?: string; rejudgeReused?: boolean
}

const TIMEOUT_MS = 120_000
const RETRY_PAUSE_MS = 5_000
// HTTP status from postResponses' message; a transient one is tried once more.
const statusOf = (error: unknown) => Number(/ (\d{3})$/.exec(error instanceof Error ? error.message : '')?.[1] ?? NaN)
const transient = (error: unknown) => {
  const status = statusOf(error)
  return status === 429 || status >= 500 || (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
}
const codeOf = (error: unknown) => {
  const status = statusOf(error)
  if (Number.isFinite(status)) return `HTTP_${status}`
  if (error instanceof Error && /^JUDGE_[A-Z_]+$/.test(error.message)) return error.message
  if (error instanceof Error && error.name === 'TimeoutError') return 'TIMEOUT'
  return 'JUDGE_FAILED'
}

async function pixelChecks(job: Job, result: Uint8Array, inputs: JudgeImage[]): Promise<PixelVerdict[]> {
  const checks: PixelVerdict[] = []
  const alpha = await alphaCheck(result, job.checklist.alpha)
  if (alpha) checks.push(alpha)
  const qr = job.checklist.qr
  if (qr) {
    const expected = 'text' in qr ? qr.text : await (async () => {
      const slot = inputs.find(image => image.label === qr.slot)
      return slot ? readQr(slot.bytes) : null
    })()
    checks.push(await qrCheck(result, expected))
  }
  return checks
}

async function loadImages(job: Job, reader: ImageReader, result: Uint8Array) {
  const inputs: JudgeImage[] = []
  for (const input of job.sources.inputs) inputs.push({ role: 'input', label: input.label, bytes: await reader.file(input.path) })
  const others: JudgeImage[] = []
  if (job.sources.cover) others.push({ role: 'cover', label: '', bytes: await reader.cover(job.sources.cover) })
  for (const key of job.sources.refs) others.push({ role: 'reference', label: '', bytes: await reader.ref(key) })
  return { inputs, all: [{ role: 'result', label: '', bytes: result } as JudgeImage, ...inputs, ...others] }
}

// One look, its hold kept for the whole call and settled at the priced tokens (or the hold, when
// the call failed before usage came back).
async function look(job: Job, ctx: JudgeContext, images: JudgeImage[]) {
  const estimate = judgeEstimateUsd(images.length, ctx.line.prices)
  if (estimate === null) throw new Error('JUDGE_NO_PRICE')
  if (ctx.spentUsd + ctx.reservedUsd + estimate > ctx.budgetUsd) return { skipped: 'RUN_BUDGET_REACHED' as const }
  ctx.reservedUsd += estimate
  const at = (ctx.now ?? (() => new Date().toISOString()))()
  const line = { at, runId: job.record.runId, hash: job.hash, estimateUsd: estimate }
  try {
    const answer = await askJudge(ctx.line, images, job.checklist.items, AbortSignal.timeout(TIMEOUT_MS))
    const spend = { ...line, outcome: 'judged' as const, costUsd: answer.costUsd }
    ctx.ledger.spend.push(spend)
    ctx.spentUsd += lineUsd(spend)
    return { answer }
  } catch (error) {
    const spend = { ...line, outcome: 'failed' as const, code: codeOf(error), costUsd: null }
    ctx.ledger.spend.push(spend)
    ctx.spentUsd += lineUsd(spend)
    throw error
  } finally {
    ctx.reservedUsd -= estimate
  }
}

async function lookWithRetry(job: Job, ctx: JudgeContext, images: JudgeImage[]) {
  try {
    return await look(job, ctx, images)
  } catch (error) {
    if (!transient(error) || ctx.stopped) throw error
    await (ctx.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(RETRY_PAUSE_MS)
    return look(job, ctx, images)
  }
}

// The first look, or its stored verdict.
async function firstLook(job: Job, ctx: JudgeContext): Promise<JobResult> {
  const cached = ctx.ledger.verdicts[job.hash]
  if (cached) {
    ctx.ledger.current[job.record.runId] = job.hash
    return { job, outcome: 'reused', verdict: cached }
  }
  return freshLook(job, ctx)
}

// A failed verdict whose ✗ came from the model gets one second look, stored under its own hash
// (so it is paid once, ever) and shown beside the first. A ✗ from the pixel checks would only
// repeat itself, so it is not looked at again.
export async function judgeJob(job: Job, ctx: JudgeContext): Promise<JobResult> {
  const first = await firstLook(job, ctx)
  const verdict = first.verdict
  if (!ctx.rejudgeFailed || !verdict || verdict.pass || !verdict.items.some(item => item.source === 'model' && !item.pass)) return first
  const key = rejudgeHash(verdict.hash)
  const stored = ctx.ledger.verdicts[key]
  if (stored) return { ...first, rejudge: stored, rejudgeReused: true }
  if (ctx.stopped) return { ...first, rejudgeCode: ctx.stopped }
  const second = await freshLook({ ...job, hash: key }, ctx, verdict.hash)
  return second.verdict ? { ...first, rejudge: second.verdict } : { ...first, rejudgeCode: second.code }
}

async function freshLook(job: Job, ctx: JudgeContext, rejudgeOf?: string): Promise<JobResult> {
  if (ctx.stopped) return { job, outcome: 'skipped', code: ctx.stopped }
  try {
    const result = await ctx.images.file(job.sources.result)
    const images = await loadImages(job, ctx.images, result)
    const pixels = await pixelChecks(job, result, images.inputs)
    const items: VerdictItem[] = pixels.map(p => ({ ...p, source: 'pixels' as const }))
    if (job.checklist.items.length) {
      const looked = await lookWithRetry(job, ctx, images.all)
      if ('skipped' in looked) { ctx.stopped = looked.skipped; return { job, outcome: 'skipped', code: looked.skipped } }
      const texts = new Map(job.checklist.items.map(item => [item.id, item.text]))
      items.push(...looked.answer!.answers.map(a => ({ id: a.id, text: texts.get(a.id)!, pass: a.pass, reason: a.reason, source: 'model' as const })))
      const verdict = toVerdict(job, items, ctx, looked.answer!.costUsd, rejudgeOf)
      return { job, outcome: 'judged', verdict }
    }
    return { job, outcome: 'judged', verdict: toVerdict(job, items, ctx, 0, rejudgeOf) }
  } catch (error) {
    return { job, outcome: 'failed', code: codeOf(error) }
  }
}

function toVerdict(job: Job, items: VerdictItem[], ctx: JudgeContext, costUsd: number | null, rejudgeOf?: string): Verdict {
  const { cell, record } = job
  const verdict: Verdict = {
    hash: job.hash, runId: record.runId, templateId: cell.templateId, version: cell.version, inputIndex: cell.inputIndex, k: cell.k,
    model: job.checklist.items.length ? ctx.line.tag : null, pass: items.every(item => item.pass), items, costUsd,
    at: (ctx.now ?? (() => new Date().toISOString()))(), ...(rejudgeOf ? { rejudgeOf } : {}),
  }
  ctx.ledger.verdicts[job.hash] = verdict
  // The second look sits beside the first; the run's current verdict stays the first.
  if (!rejudgeOf) ctx.ledger.current[record.runId] = job.hash
  return verdict
}

// At most `concurrency` jobs at once, results in order. Once stopped (budget, Ctrl-C) no new look
// starts; cached verdicts are still reported.
export async function judgeAll(jobs: Job[], ctx: JudgeContext, concurrency: number, onDone?: (r: JobResult) => void): Promise<JobResult[]> {
  const results: JobResult[] = []
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++
      results[index] = await judgeJob(jobs[index], ctx)
      onDone?.(results[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
  return results
}
