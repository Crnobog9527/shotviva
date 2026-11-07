'use client'

import { useCallback, useEffect, useState } from 'react'

export type Loaded<T> = { data: T | undefined; failed: boolean; reload(): void }

// One read through a server action for a dialog view, run when the view mounts and again on
// reload(). What was read stays on screen while a reload runs, so a reply never blanks the
// thread; a failed first read shows the error state, a failed reload keeps the old data.
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [data, setData] = useState<T>()
  const [failed, setFailed] = useState(false)
  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    load().then(
      (value) => {
        if (!live) return
        setData(value)
        setFailed(false)
      },
      () => {
        if (live) setFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [load, round])
  const reload = useCallback(() => setRound((value) => value + 1), [])
  return { data, failed, reload }
}
