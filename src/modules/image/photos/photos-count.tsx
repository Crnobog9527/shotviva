'use client'

import { useJobs } from '../generation/use-jobs'

// "2 in progress · 4 done" beside the Photos title, counting this tab's own jobs too.
export function PhotosCount({ runningIds, done }: { runningIds: string[]; done: number }) {
  const ids = new Set(runningIds)
  for (const job of useJobs()) {
    if (job.status === 'running') ids.add(job.id)
    else ids.delete(job.id)
  }
  return (
    <span className="text-caption text-muted-foreground">
      {ids.size} in progress · {done} done
    </span>
  )
}
