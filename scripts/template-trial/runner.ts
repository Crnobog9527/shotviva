import { AppError } from '../../src/core/errors'
import type { TestRun } from '../../src/modules/image/test-run/test-run-row'
import { findTestRun } from '../../src/modules/image/test-run/test-run-store'
import { runTestGenerate } from '../../src/modules/image/test-run/run-test-generate'
import { batchIdOf, MAX_ATTEMPTS, runIdOf, type Cell } from './cells'

// Runs cells through the admin's own 「首次出图」 (runTestGenerate: the same prompt assembly,
// provider, face-swap screen, daily budget and admin_test_runs / admin_test_spend ledger). A few at
// a time; a provider hiccup is retried with the next attempt's run id; the database's daily budget
// stops everything, and this run's own budget stops new cells once reached.

const TRANSIENT = new Set(['PROVIDER_TIMEOUT', 'PROVIDER_FAILED', 'TIMEOUT'])
// The admin panel's cleanup marks a run still running after 10 minutes as failed (0785).
const STALE_MS = 10 * 60 * 1000

export type CellResult = { cell: Cell; run?: TestRun; reused?: boolean; outcome: 'succeeded' | 'failed' | 'running' | 'skipped'; code?: string }

export type RunContext = {
  deps: Parameters<typeof runTestGenerate>[0]
  actorId: string
  photoIds: Map<string, string>
  budgetUsd: number
  spentUsd: number
  stopped?: string
}

const cost = (run: TestRun) => run.costUsd ?? run.estimateUsd

function bodyOf(cell: Cell, ctx: RunContext, runId: string) {
  const input = cell.input
  return {
    run_id: runId, batch_id: batchIdOf(cell), template_id: cell.templateId,
    photo_id: cell.photoHash ? ctx.photoIds.get(cell.photoHash) ?? null : null,
    inputs: { copy: input.fields, aspect_ratio: input.aspectRatio, resolution: cell.resolution, note: input.note, toggles: input.toggles },
  }
}

// An existing row for this attempt: done, still running elsewhere, or a failure to move past.
function settled(cell: Cell, run: TestRun, attempt: number): CellResult | 'next' {
  if (run.status === 'succeeded') return { cell, run, reused: true, outcome: 'succeeded' }
  if (run.status === 'running' && Date.now() - Date.parse(run.createdAt) < STALE_MS) return { cell, run, outcome: 'running' }
  const retry = run.status === 'running' || TRANSIENT.has(run.errorCode ?? '')
  return retry && attempt < MAX_ATTEMPTS - 1 ? 'next' : { cell, run, outcome: 'failed', code: run.errorCode ?? 'TIMEOUT' }
}

async function attemptNew(cell: Cell, ctx: RunContext, runId: string, attempt: number): Promise<CellResult | 'next'> {
  if (ctx.stopped) return { cell, outcome: 'skipped', code: ctx.stopped }
  if (ctx.spentUsd >= ctx.budgetUsd) return { cell, outcome: 'skipped', code: 'RUN_BUDGET_REACHED' }
  try {
    const run = await runTestGenerate(ctx.deps, { actorId: ctx.actorId, body: bodyOf(cell, ctx, runId) })
    ctx.spentUsd += cost(run)
    if (run.status === 'succeeded') return { cell, run, outcome: 'succeeded' }
    if (TRANSIENT.has(run.errorCode ?? '') && attempt < MAX_ATTEMPTS - 1) return 'next'
    return { cell, run, outcome: 'failed', code: run.errorCode ?? 'FAILED' }
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'FAILED'
    if (code === 'TEST_BUDGET_EXCEEDED') ctx.stopped = 'TEST_BUDGET_EXCEEDED'
    return { cell, outcome: code === 'TEST_BUDGET_EXCEEDED' ? 'skipped' : 'failed', code }
  }
}

// Read only, for --dry-run: whether a cell already has a result (on any attempt) or would run.
export async function peekCell(cell: Cell, db: RunContext['deps']['db']): Promise<'done' | 'pending'> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const run = await findTestRun(db, runIdOf(cell, attempt))
    if (run?.status === 'succeeded') return 'done'
    if (!run) return 'pending'
  }
  return 'pending'
}

export async function runCell(cell: Cell, ctx: RunContext): Promise<CellResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const runId = runIdOf(cell, attempt)
    const existing = await findTestRun(ctx.deps.db, runId)
    const result = existing ? settled(cell, existing, attempt) : await attemptNew(cell, ctx, runId, attempt)
    if (result !== 'next') return result
  }
  return { cell, outcome: 'failed', code: 'RETRIES_EXHAUSTED' }
}

// At most `concurrency` cells at once, in order; results in the cells' order.
export async function runAll(cells: Cell[], ctx: RunContext, concurrency: number, onDone?: (r: CellResult) => void): Promise<CellResult[]> {
  const results: CellResult[] = new Array(cells.length)
  let next = 0
  const worker = async () => {
    while (next < cells.length) {
      const index = next++
      results[index] = await runCell(cells[index], ctx)
      onDone?.(results[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cells.length) }, worker))
  return results
}
