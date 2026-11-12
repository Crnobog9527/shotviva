import { AppError } from '../../src/core/errors'
import type { TestRun } from '../../src/modules/image/test-run/test-run-row'
import { findTestRun } from '../../src/modules/image/test-run/test-run-store'
import { runTestGenerate } from '../../src/modules/image/test-run/run-test-generate'
import { batchIdOf, MAX_ATTEMPTS, runIdOf, type Cell } from './cells'
import { isDeterministic, watchedProvider, type Failure } from './provider-failure'

// Runs cells through the admin's own 「首次出图」 (runTestGenerate: the same prompt assembly, provider,
// face-swap screen, daily budget and admin_test_runs / admin_test_spend ledger), a few at a time.
//
// Money: every call first reserves its estimate; a call starts only if what this run spent plus what
// running calls hold plus its own estimate stays within --budget, so concurrency cannot overshoot.
// The database's daily budget still applies and stops everything (TEST_BUDGET_EXCEEDED).
//
// Retries: a cell's attempts use run ids 0, 1, 2, …; a run reuses a success on any attempt. Within one
// run a provider hiccup (timeout, 5xx, rate limit) is retried after a growing pause, up to
// TRIES_PER_RUN calls; a refusal, a face-swap refusal or a request the provider will refuse again
// (4xx, no quota or credit) is not. A cell that ended failed in an earlier run stays failed unless
// --retry-failed, which carries on from its next free attempt id.

export const TRIES_PER_RUN = 3
const BACKOFF_MS = [5_000, 20_000]
const NEVER_RETRY = new Set(['CONTENT_REJECTED', 'IDENTITY_SWAP_REFUSED'])
// The admin panel's cleanup marks a run still running after 10 minutes as failed (0785).
const STALE_MS = 10 * 60 * 1000

export type CellResult = { cell: Cell; run?: TestRun; reused?: boolean; outcome: 'succeeded' | 'failed' | 'running' | 'skipped'; code?: string; failure?: Failure | null }

export type RunContext = {
  deps: Parameters<typeof runTestGenerate>[0]
  actorId: string
  photoIds: Map<string, string>
  budgetUsd: number
  spentUsd: number
  reservedUsd: number
  // What one call of this cell may cost at most (the trial's own estimate for its model).
  estimateOf: (cell: Cell) => number
  retryFailed?: boolean
  stopped?: string
  sleep?: (ms: number) => Promise<void>
}

const cost = (run: TestRun) => run.costUsd ?? run.estimateUsd
const pause = (ctx: RunContext, ms: number) => (ctx.sleep ?? (t => new Promise(resolve => setTimeout(resolve, t))))(ms)

function bodyOf(cell: Cell, ctx: RunContext, runId: string) {
  const input = cell.input
  return {
    run_id: runId, batch_id: batchIdOf(cell), template_id: cell.templateId,
    photo_id: cell.photoHash ? ctx.photoIds.get(cell.photoHash) ?? null : null,
    inputs: { copy: input.fields, aspect_ratio: input.aspectRatio, resolution: cell.resolution, note: input.note, toggles: input.toggles },
  }
}

// The cell's earlier attempts, in order, up to the first unused id.
async function history(cell: Cell, db: RunContext['deps']['db']) {
  const runs: TestRun[] = []
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const run = await findTestRun(db, runIdOf(cell, attempt))
    if (!run) break
    runs.push(run)
  }
  return runs
}

// One call with its estimate held for its whole duration.
async function call(cell: Cell, ctx: RunContext, attempt: number): Promise<CellResult> {
  if (ctx.stopped) return { cell, outcome: 'skipped', code: ctx.stopped }
  const estimate = ctx.estimateOf(cell)
  if (ctx.spentUsd + ctx.reservedUsd + estimate > ctx.budgetUsd) return { cell, outcome: 'skipped', code: 'RUN_BUDGET_REACHED' }
  ctx.reservedUsd += estimate
  const slot: { failure?: Failure | null } = {}
  try {
    const deps = { ...ctx.deps, provider: watchedProvider(ctx.deps.provider, slot) }
    const run = await runTestGenerate(deps, { actorId: ctx.actorId, body: bodyOf(cell, ctx, runIdOf(cell, attempt)) })
    ctx.spentUsd += cost(run)
    return run.status === 'succeeded' ? { cell, run, outcome: 'succeeded' } : { cell, run, outcome: 'failed', code: run.errorCode ?? 'FAILED', failure: slot.failure }
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'FAILED'
    if (code === 'TEST_BUDGET_EXCEEDED') ctx.stopped = code
    return { cell, outcome: code === 'TEST_BUDGET_EXCEEDED' ? 'skipped' : 'failed', code }
  } finally {
    ctx.reservedUsd -= estimate
  }
}

const retryable = (result: CellResult) => result.outcome === 'failed' && Boolean(result.run) &&
  !NEVER_RETRY.has(result.code ?? '') && !isDeterministic(result.failure ?? null)

// Where an earlier run left the cell: done, still running, failed (and whether to carry on), or new.
function resume(cell: Cell, runs: TestRun[], ctx: RunContext): CellResult | number {
  const done = runs.find(run => run.status === 'succeeded')
  if (done) return { cell, run: done, reused: true, outcome: 'succeeded' }
  const last = runs.at(-1)
  if (!last) return 0
  if (last.status === 'running' && Date.now() - Date.parse(last.createdAt) < STALE_MS) return { cell, run: last, outcome: 'running' }
  const code = last.status === 'running' ? 'TIMEOUT' : last.errorCode ?? 'FAILED'
  if (!ctx.retryFailed || NEVER_RETRY.has(code)) return { cell, run: last, reused: true, outcome: 'failed', code }
  return runs.length
}

export async function runCell(cell: Cell, ctx: RunContext): Promise<CellResult> {
  const from = resume(cell, await history(cell, ctx.deps.db), ctx)
  if (typeof from !== 'number') return from
  let result: CellResult = { cell, outcome: 'failed', code: 'RETRIES_EXHAUSTED' }
  for (let tries = 0, attempt = from; tries < TRIES_PER_RUN && attempt < MAX_ATTEMPTS; tries++, attempt++) {
    if (tries > 0) await pause(ctx, BACKOFF_MS[Math.min(tries, BACKOFF_MS.length) - 1])
    result = await call(cell, ctx, attempt)
    if (!retryable(result)) return result
  }
  return result
}

// Read only, for --dry-run: whether a cell already has a result (on any attempt) or would run.
export async function peekCell(cell: Cell, db: RunContext['deps']['db']): Promise<'done' | 'pending'> {
  return (await history(cell, db)).some(run => run.status === 'succeeded') ? 'done' : 'pending'
}

// At most `concurrency` cells at once, in order; results in the cells' order. Once stopped (budget,
// Ctrl-C), no new cell starts; the running ones finish and are recorded.
export async function runAll(cells: Cell[], ctx: RunContext, concurrency: number, onDone?: (r: CellResult) => void): Promise<CellResult[]> {
  const results: CellResult[] = []
  let next = 0
  const worker = async () => {
    while (next < cells.length) {
      const index = next++
      results[index] = ctx.stopped ? { cell: cells[index], outcome: 'skipped', code: ctx.stopped } : await runCell(cells[index], ctx)
      onDone?.(results[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cells.length) }, worker))
  return results
}
