import 'server-only'

import { IdentitySwapRefused, type IdentityJudgeUsage } from '@/core/identity-guard'
import { GenerationFailure, settleProviderCall, type DecisionCost, type ProviderInput, type ProviderPrices, type SettleDeps, type SettleLedger } from '@/core/jobs'
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

// The cost of a run that only reached the decision model (refused): its tokens at that model's
// prices; null when a price is missing (the budget then counts 0 for it, 0785).
export function decisionOnlyCost(usage: IdentityJudgeUsage | null, prices: ProviderPrices | null | undefined) {
  if (!usage) return { usage: null, costUsd: null }
  const tokens = { decision_input_tokens: usage.inputTokens, decision_output_tokens: usage.outputTokens }
  const input = prices?.inputTextPerM
  const output = prices?.outputPerM
  const costUsd = input == null || output == null ? null : Math.round(((usage.inputTokens * input + usage.outputTokens * output) / 1e6) * 1e6) / 1e6
  return { usage: tokens, costUsd }
}

export type ModelStep = { call: Omit<ProviderInput, 'signal'>; decision?: DecisionCost }

// After admin_begin_test_run (the budget is held before any model is called, ARCHITECTURE §10.b):
// the decision step (face-swap judge, or the edit's scope call), then the image call. A refusal
// ends the run as failed / IDENTITY_SWAP_REFUSED with what the decision call cost; anything else
// that breaks before the image call ends it as PREPARE_FAILED and is rethrown.
export async function continueTestRun(
  deps: SettleDeps,
  run: TestRun,
  step: () => Promise<ModelStep>,
  decisionPrices: ProviderPrices | null | undefined,
): Promise<TestRun> {
  const started = Date.now()
  let next: ModelStep
  try {
    next = await step()
  } catch (error) {
    const refused = error instanceof IdentitySwapRefused
    const cost = refused ? decisionOnlyCost(error.usage, decisionPrices) : {}
    await failSafely(deps, run.id, started, refused ? 'IDENTITY_SWAP_REFUSED' : 'PREPARE_FAILED', cost)
    if (!refused) throw error
    return (await findTestRun(deps.db, run.id)) ?? run
  }
  return settleTestRun(deps, run, next.call, next.decision)
}
