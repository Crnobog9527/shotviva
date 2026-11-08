import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { noteGenerationFailure } from '../alerts'
import { captureError } from '../analytics'
import { logger } from '../logger'
import { keepJobInputs, type ObjectStore } from '../storage'
import { classifyFailure, GenerationFailure, type FailureStage } from './generation-failure'
import { jobCostUsd } from './job-cost'
import type { Job } from './job-schema'
import { ProviderError, type GenerationProvider, type ProviderInput, type ProviderOutput, type ProviderPrices, type ProviderUsage } from './provider'
import { confirmJob, refundJob, type JobCost } from './settlement'

// Vercel stops the function at maxDuration (300s). The provider gets less than that so a
// timeout still leaves time to refund; a killed function would strand the reservation.
export const PROVIDER_TIMEOUT_MS = 240_000

export type SettleDeps = {
  db: SupabaseClient
  store: ObjectStore
  provider: GenerationProvider
  providerTimeoutMs?: number
}

// Races the call against a timer as well as aborting it, so an adapter that ignores the
// signal still cannot hold the request past the deadline.
async function withDeadline<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new ProviderError('timeout', `provider exceeded ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([run(controller.signal), deadline])
  } finally {
    clearTimeout(timer)
  }
}

async function refundSafely(db: SupabaseClient, jobId: string, errorCode: string, cost: JobCost): Promise<boolean> {
  try {
    await refundJob(db, { jobId, errorCode, ...cost })
    return true
  } catch (error) {
    // Leaves the job 'running' with credits held; v1 has no sweeper, so this must be loud.
    logger.error('refund failed; credits still reserved', { jobId, errorCode, error })
    captureError(error, { alert: 'credit_refund_failed', level: 'fatal', fields: { jobId, errorCode } })
    return false
  }
}

// A step billed before the image call: the photo-edit decision (T30). Its tokens join the job's
// usage and are priced at that step's own provider (jobCostUsd's third argument).
export type DecisionCost = {
  usage: Required<Pick<ProviderUsage, 'decision_input_tokens' | 'decision_output_tokens'>>
  prices: ProviderPrices | null
}

// Usage and cost go into the same confirm / refund call that settles the job (T33). With a
// decision step but no image usage the tokens are still recorded; the cost is then null.
function costOf(provider: GenerationProvider, usage: ProviderUsage | null, decision?: DecisionCost): JobCost {
  const all = decision ? { ...usage, ...decision.usage } : usage
  return { usage: all, costUsd: jobCostUsd(all, provider.prices, decision?.prices) }
}

// The output written, and alongside it the job's uploads copied next to it (T40, §8.3「输入图随
// 作品保留」). The copy never throws: a failed one is just not kept.
async function storeOutput(deps: SettleDeps, job: Job, output: { key: string; bytes: Uint8Array; contentType: string }, inputKeys: string[]) {
  const [, kept] = await Promise.all([
    deps.store.put(output.key, output.bytes, output.contentType),
    keepJobInputs(deps.store, { userId: job.userId, jobId: job.id }, inputKeys),
  ])
  return kept
}

// decision: the photo-edit step's cost (T30). inputKeys: the job's own uploads, kept with it (T40).
export type SettleExtras = { decision?: DecisionCost; inputKeys?: string[] }

// Who pays and where the result goes: a user's job (credits, generation_jobs, outputs/) or an
// admin test run (nobody, admin_test_runs, admin-tests/; T85). The provider call, its deadline,
// the failure codes and the cost are the same for both (settleProviderCall).
export type SettleLedger<T> = {
  // For logs and alerts only.
  id: string
  source: string
  // Writes the result; what it returns is handed to confirm.
  store(output: ProviderOutput): Promise<string[]>
  confirm(stored: string[], cost: JobCost): Promise<T>
  // Records the failure; whether the charge (if any) came back.
  fail(jobCode: string, cost: JobCost): Promise<boolean>
  // false: an admin test run, which stays out of Sentry's failure alert and the Owner's
  // failure-rate check (ARCHITECTURE §10.b 「隔离」).
  alerts: boolean
}

// Steps 2–3 of ARCHITECTURE §4 for a freshly started job: provider → write output → confirm.
// Any failure, timeout included, is settled through the ledger before the error reaches the
// client. A failure after the provider answered still records what it reported using.
export async function settleProviderCall<T>(
  deps: SettleDeps,
  ledger: SettleLedger<T>,
  call: Omit<ProviderInput, 'signal'>,
  decision?: DecisionCost,
): Promise<T> {
  let stage: FailureStage = 'provider'
  let usage: ProviderUsage | null = null
  try {
    const output = await withDeadline(
      (signal) => deps.provider.generate({ ...call, signal }),
      deps.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS,
    )
    usage = output.usage ?? null
    stage = 'store_output'
    const stored = await ledger.store(output)
    stage = 'confirm'
    return await ledger.confirm(stored, costOf(deps.provider, usage, decision))
  } catch (error) {
    if (error instanceof ProviderError && error.usage) usage = error.usage
    const failure = classifyFailure(stage, error)
    // `error` is redacted by the logger and adapters never put prompts in messages.
    logger.error('generation failed', { jobId: ledger.id, stage, jobCode: failure.jobCode, error })
    // A declined photo or text is the user's input, not an outage; it stays out of the
    // failure-rate alert and is still counted in the `generate` event's error_code.
    const alert = ledger.alerts && failure.jobCode !== 'CONTENT_REJECTED'
    if (alert) captureError(error, { alert: 'generation_failed', fields: { jobId: ledger.id, stage, jobCode: failure.jobCode, source: ledger.source } })
    const refunded = await ledger.fail(failure.jobCode, costOf(deps.provider, usage, decision))
    // After the refund, so this job counts as failed in the Owner's failure-rate check (T72); the
    // check itself runs after the response (after()), never on this request.
    if (alert) noteGenerationFailure()
    throw new GenerationFailure(failure.error, ledger.id, refunded, failure.jobCode)
  }
}

// A user's job: output under outputs/, uploads kept next to it (T40), confirm_job or refund_job.
export function settleGeneration(
  deps: SettleDeps,
  job: Job,
  call: Omit<ProviderInput, 'signal'>,
  outputKey: string,
  { decision, inputKeys = [] }: SettleExtras = {},
): Promise<Job> {
  const ledger: SettleLedger<Job> = {
    id: job.id,
    source: job.source,
    alerts: true,
    store: (output) => storeOutput(deps, job, { key: outputKey, bytes: output.bytes, contentType: output.contentType }, inputKeys),
    confirm: (keptInputs, cost) => confirmJob(deps.db, { jobId: job.id, outputKey, keptInputs, ...cost }),
    fail: (errorCode, cost) => refundSafely(deps.db, job.id, errorCode, cost),
  }
  return settleProviderCall(deps, ledger, call, decision)
}
