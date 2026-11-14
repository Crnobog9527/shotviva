'use client'

import { Button } from '@/core/ui/button'

import { seriesCopy as copy } from './copy'
import type { SeriesDeleteState } from './use-series-delete'

// What the last 删除 did, series by series; a partial success is shown, not hidden.
export function DeleteResult({ state }: { state: SeriesDeleteState }) {
  if (state.error) return <p role="alert" className="text-destructive text-sm">{state.error}</p>
  if (!state.result) return null
  const { outcome, names } = state.result
  const name = (id: string) => names.get(id) ?? id
  const moved = outcome.done.reduce((sum, item) => sum + item.moved, 0)
  return (
    <section aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm">
      <div className="flex items-center">
        <h2 className="font-medium">{copy.deleteResult}</h2>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={state.dismiss}>{copy.dismiss}</Button>
      </div>
      {outcome.done.length > 0 && (
        <p className="text-emerald-700 dark:text-emerald-400">
          {copy.deleteDone(outcome.done.length, moved)}：{outcome.done.map(item => `${name(item.id)}（${copy.memberCount(item.moved)}）`).join('、')}
        </p>
      )}
      {outcome.skipped.length > 0 && (
        <div className="text-destructive">
          <p>{copy.deleteSkipped(outcome.skipped.length)}：</p>
          <ul className="mt-1 list-disc pl-5">{outcome.skipped.map(item => <li key={item.id}>{name(item.id)}：{item.reason}</li>)}</ul>
        </div>
      )}
    </section>
  )
}
