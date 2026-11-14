'use client'

import { useEffect } from 'react'

// Jobs a mounted wait screen is showing (the workspace, a batch, an edit): when one settles in
// front of the user, that screen already shows the result, so the app-wide toast skips it.
const shown = new Map<string, number>()

export const isWatched = (id: string) => (shown.get(id) ?? 0) > 0

export function useWatchJobs(ids: readonly string[]) {
  const key = ids.join(',')
  useEffect(() => {
    const list = key ? key.split(',') : []
    list.forEach((id) => shown.set(id, (shown.get(id) ?? 0) + 1))
    return () => list.forEach((id) => shown.set(id, (shown.get(id) ?? 1) - 1))
  }, [key])
}
