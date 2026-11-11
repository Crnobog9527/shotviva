import type { AgainContext } from '../../again/again-context'

// Make again's preparation per work, for this tab (总控 review of #508): preparing copies the
// work's kept photos back to fresh uploads, so going Back to the work and into Make again again
// reuses the first copy instead of leaving one more unused upload each time. A generation uses
// those uploads up, so starting one forgets the entry; a failed preparation is never kept.
const prepared = new Map<string, Promise<AgainContext | null>>()

export function prepareOnce(jobId: string, prepare: (jobId: string) => Promise<AgainContext | null>): Promise<AgainContext | null> {
  const hit = prepared.get(jobId)
  if (hit) return hit
  const promise = prepare(jobId).then(
    (context) => {
      if (!context) prepared.delete(jobId)
      return context
    },
    (error: unknown) => {
      prepared.delete(jobId)
      throw error
    },
  )
  prepared.set(jobId, promise)
  return promise
}

export const spendAgain = (jobId: string) => void prepared.delete(jobId)
