import 'server-only'

import { GenerationFailure, settleProviderCall, type DecisionCost, type ProviderInput, type SettleDeps, type SettleLedger } from '@/core/jobs'
import { logger } from '@/core/logger'

import { testOutputKey } from './test-run-keys'
import type { TestRun } from './test-run-row'
import { findTestRun, finishTestRun } from './test-run-store'

// Settles an admin test run through the very provider step a user's job uses (settleProviderCall):
// same deadline, failure codes, usage and real cost. Only the ledger differs (ARCHITECTURE §10.b):
// the result goes to admin-tests/outputs/, nothing is charged or refunded, and a failure stays out
// of Sentry's failure alert and the Owner's failure-rate check. A failed run comes back as its row.

async function failSafely(deps: SettleDeps, runId: string, started: number, errorCode: string, cost: Parameters<SettleLedger<TestRun>['fail']>[1]) {
  try {
    await finishTestRun(deps.db, { runId, status: 'failed', errorCode, durationMs: Date.now() - started, ...cost })
  } catch (error) {
    // The panel's cleanup marks a run still 'running' after 10 minutes as failed (0785).
    logger.error('admin test run not settled', { runId, errorCode, error })
  }
  return true
}

export async function settleTestRun(deps: SettleDeps, run: TestRun, call: Omit<ProviderInput, 'signal'>, decision?: DecisionCost): Promise<TestRun> {
  const started = Date.now()
  const outputKey = testOutputKey(run.id)
  const ledger: SettleLedger<TestRun> = {
    id: run.id,
    source: 'admin_test',
    alerts: false,
    store: async (output) => {
      await deps.store.put(outputKey, output.bytes, output.contentType)
      return []
    },
    confirm: (_stored, cost) => finishTestRun(deps.db, { runId: run.id, status: 'succeeded', outputKey, durationMs: Date.now() - started, ...cost }),
    fail: (errorCode, cost) => failSafely(deps, run.id, started, errorCode, cost),
  }
  try {
    return await settleProviderCall(deps, ledger, call, decision)
  } catch (error) {
    if (!(error instanceof GenerationFailure)) throw error
    return (await findTestRun(deps.db, run.id)) ?? run
  }
}
