'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { ActionValue } from '../templates'
import { seriesCopy as copy } from './copy'
import type { SeriesDeleteOutcome } from './delete'
import type { SeriesListItem } from './list-rules'

export type DeleteSeries = (ids: string[]) => Promise<ActionValue<SeriesDeleteOutcome>>
export type DeleteResultView = { outcome: SeriesDeleteOutcome; names: Map<string, string> }

// 删除 from a row or the batch bar (Owner 2026-11-14): the dialog shows what it will do, the result
// stays on screen series by series until dismissed. `done` runs after a call that went through.
export function useSeriesDelete(remove: DeleteSeries, done: () => void) {
  const router = useRouter()
  const [target, setTarget] = useState<SeriesListItem[] | null>(null)
  const [result, setResult] = useState<DeleteResultView | null>(null)
  const [error, setError] = useState('')
  const [pending, run] = useTransition()
  function confirm(ids: string[]) {
    const names = new Map((target ?? []).map(item => [item.id, item.name_zh]))
    setTarget(null)
    run(async () => {
      const response = await remove(ids).catch(() => null)
      if (response?.ok) {
        setResult({ outcome: response.value, names })
        setError('')
        done()
      } else setError(response?.message ?? copy.transient)
      router.refresh()
    })
  }
  return { target, open: setTarget, cancel: () => setTarget(null), confirm, pending, result, error, dismiss: () => setResult(null) }
}
export type SeriesDeleteState = ReturnType<typeof useSeriesDelete>
