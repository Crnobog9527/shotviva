'use client'

import { useCallback, useEffect, useState } from 'react'

// TEMPORARY (T4 validation harness). T8 builds the real use-generation-job.ts; this only
// proves the server contract: client job id, status polling and resume after backgrounding.

export type TestJob = { id: string; status: 'running' | 'succeeded' | 'failed'; error_code: string | null; file_url: string | null }
export type TestGeneration =
  | { phase: 'idle' }
  | { phase: 'generating'; jobId: string }
  | { phase: 'succeeded'; job: TestJob }
  | { phase: 'failed'; code: string; message: string; refunded: boolean | null }

const PENDING = 'shotviva.upload-test.pending-job'
const POLL_MS = 3000

const store = {
  get: () => (typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(PENDING)),
  set: (id: string) => sessionStorage.setItem(PENDING, id),
  clear: () => sessionStorage.removeItem(PENDING),
}

function settled(job: TestJob): TestGeneration {
  store.clear()
  if (job.status === 'succeeded') return { phase: 'succeeded', job }
  return { phase: 'failed', code: job.error_code ?? 'UNKNOWN', message: 'Generation failed', refunded: true }
}

async function readJob(jobId: string): Promise<TestJob | null> {
  const response = await fetch(`/api/generate/${jobId}`, { cache: 'no-store' })
  return response.ok ? ((await response.json()) as TestJob) : null
}

export function useTestGeneration() {
  const [state, setState] = useState<TestGeneration>({ phase: 'idle' })
  const pendingId = state.phase === 'generating' ? state.jobId : null

  // Polls while a job is pending; also resumes one left over from a reload or a tab that was
  // put in the background (the POST may have died with it, the server job did not).
  useEffect(() => {
    const jobId = pendingId ?? store.get()
    if (!jobId) return
    // Deferred so the restore is a callback, not a synchronous setState in the effect body.
    const restore = pendingId ? undefined : setTimeout(() => setState({ phase: 'generating', jobId }), 0)
    const timer = setInterval(async () => {
      const job = await readJob(jobId).catch(() => null)
      if (job && job.status !== 'running') setState(settled(job))
    }, POLL_MS)
    return () => {
      clearTimeout(restore)
      clearInterval(timer)
    }
  }, [pendingId])

  const generate = useCallback(async (body: Record<string, unknown>) => {
    const jobId = crypto.randomUUID()
    store.set(jobId)
    setState({ phase: 'generating', jobId })
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, job_id: jobId }),
      })
      const json = (await response.json()) as TestJob & { code?: string; message?: string; refunded?: boolean }
      if (response.ok && json.status !== 'running') return setState(settled(json))
      if (!response.ok) {
        store.clear()
        setState({ phase: 'failed', code: json.code ?? 'UNKNOWN', message: json.message ?? '', refunded: json.refunded ?? null })
      }
    } catch {
      // Network drop (e.g. iOS suspended the tab): keep polling the job id instead.
    }
  }, [])

  return { state, generate, reset: () => setState({ phase: 'idle' }) }
}
