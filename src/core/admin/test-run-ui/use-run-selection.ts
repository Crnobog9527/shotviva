'use client'

import { useState } from 'react'

import type { TestRunView } from '../test-runs'

// What the ticked results are for: compare (two) or edit together (up to three). Kept in tick
// order; a result that disappears (cleanup, reload) simply drops out.
export function useRunSelection(runs: readonly TestRunView[]) {
  const [ids, setIds] = useState<string[]>([])
  const byId = new Map(runs.map((run) => [run.id, run]))
  const picked = ids.flatMap((id) => {
    const run = byId.get(id)
    return run && run.status === 'succeeded' ? [run] : []
  })
  const selected = new Set(picked.map((run) => run.id))
  const onSelect = (run: TestRunView, on: boolean) => setIds((current) => (on ? [...current.filter((id) => id !== run.id), run.id] : current.filter((id) => id !== run.id)))
  return { picked, selected, onSelect, clear: () => setIds([]) }
}
