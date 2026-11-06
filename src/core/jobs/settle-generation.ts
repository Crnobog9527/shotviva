import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { captureError } from '../analytics'
import { logger } from '../logger'
import type { ObjectStore } from '../storage'
import { classifyFailure, GenerationFailure, type FailureStage } from './generation-failure'
import { jobCostUsd } from './job-cost'
import type { Job } from './job-schema'
import { ProviderError, type GenerationProvider, type ProviderInput, type ProviderUsage } from './provider'
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

// Usage and cost go into the same confirm / refund call that settles the job (T33).
function costOf(provider: GenerationProvider, usage: ProviderUsage | null): JobCost {
  return { usage, costUsd: jobCostUsd(usage, provider.prices) }
}

// Steps 2–3 of ARCHITECTURE §4 for a freshly reserved job: provider → write output → confirm.
// Any failure, timeout included, refunds before the error reaches the client. A failure after
// the provider answered still records what it reported using.
export async function settleGeneration(
  deps: SettleDeps,
  job: Job,
  call: Omit<ProviderInput, 'signal'>,
  outputKey: string,
): Promise<Job> {
  let stage: FailureStage = 'provider'
  let usage: ProviderUsage | null = null
  try {
    const output = await withDeadline(
      (signal) => deps.provider.generate({ ...call, signal }),
      deps.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS,
    )
    usage = output.usage ?? null
    stage = 'store_output'
    await deps.store.put(outputKey, output.bytes, output.contentType)
    stage = 'confirm'
    return await confirmJob(deps.db, { jobId: job.id, outputKey, ...costOf(deps.provider, usage) })
  } catch (error) {
    if (error instanceof ProviderError && error.usage) usage = error.usage
    const failure = classifyFailure(stage, error)
    // `error` is redacted by the logger and adapters never put prompts in messages.
    logger.error('generation failed', { jobId: job.id, stage, jobCode: failure.jobCode, error })
    // A declined photo or text is the user's input, not an outage; it stays out of the
    // failure-rate alert and is still counted in the `generate` event's error_code.
    if (failure.jobCode !== 'CONTENT_REJECTED') {
      captureError(error, { alert: 'generation_failed', fields: { jobId: job.id, stage, jobCode: failure.jobCode, source: job.source } })
    }
    const refunded = await refundSafely(deps.db, job.id, failure.jobCode, costOf(deps.provider, usage))
    throw new GenerationFailure(failure.error, job.id, refunded, failure.jobCode)
  }
}
