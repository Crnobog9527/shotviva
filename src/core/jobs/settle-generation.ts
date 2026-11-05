import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../logger'
import type { ObjectStore } from '../storage'
import { classifyFailure, GenerationFailure, type FailureStage } from './generation-failure'
import type { Job } from './job-schema'
import { ProviderError, type GenerationProvider, type ProviderInput } from './provider'
import { confirmJob, refundJob } from './settlement'

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

async function refundSafely(db: SupabaseClient, jobId: string, errorCode: string): Promise<boolean> {
  try {
    await refundJob(db, { jobId, errorCode })
    return true
  } catch (error) {
    // Leaves the job 'running' with credits held; v1 has no sweeper, so this must be loud.
    logger.error('refund failed; credits still reserved', { jobId, errorCode, error })
    return false
  }
}

// Steps 2–3 of ARCHITECTURE §4 for a freshly reserved job: provider → write output → confirm.
// Any failure, timeout included, refunds before the error reaches the client.
export async function settleGeneration(
  deps: SettleDeps,
  job: Job,
  call: Omit<ProviderInput, 'signal'>,
  outputKey: string,
): Promise<Job> {
  let stage: FailureStage = 'provider'
  try {
    const output = await withDeadline(
      (signal) => deps.provider.generate({ ...call, signal }),
      deps.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS,
    )
    stage = 'store_output'
    await deps.store.put(outputKey, output.bytes, output.contentType)
    stage = 'confirm'
    return await confirmJob(deps.db, { jobId: job.id, outputKey })
  } catch (error) {
    const failure = classifyFailure(stage, error)
    // `error` is redacted by the logger and adapters never put prompts in messages.
    logger.error('generation failed', { jobId: job.id, stage, jobCode: failure.jobCode, error })
    const refunded = await refundSafely(deps.db, job.id, failure.jobCode)
    throw new GenerationFailure(failure.error, job.id, refunded)
  }
}
