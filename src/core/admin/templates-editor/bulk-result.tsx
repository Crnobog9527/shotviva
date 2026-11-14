'use client'

import { Button } from '@/core/ui/button'

import { describeBlockers, type ActiveChangeItem, type ActiveChangeOutcome } from '../templates/publish-rules'
import { bulkCopy } from './copy'

type Props = { outcome: ActiveChangeOutcome; onDismiss: () => void }

const names = (items: ActiveChangeItem[]) => items.map((item) => item.name).join('、')

// What one bulk call did, template by template (T60): partial success is shown, not hidden.
export function BulkResult({ outcome, onDismiss }: Props) {
  const { active, changed, unchanged, skipped } = outcome
  return (
    <section aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm">
      <div className="flex items-center">
        <h2 className="font-medium">{bulkCopy.resultTitle(active)}</h2>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onDismiss}>
          {bulkCopy.dismiss}
        </Button>
      </div>
      {changed.length > 0 ? (
        <p className="text-emerald-700">
          {bulkCopy.changed(active, changed.length)}：{names(changed)}
        </p>
      ) : null}
      {unchanged.length > 0 ? (
        <p className="text-muted-foreground">
          {bulkCopy.unchanged(active, unchanged.length)}：{names(unchanged)}
        </p>
      ) : null}
      {skipped.length > 0 ? (
        <div className="text-destructive">
          <p>{bulkCopy.skipped(active, skipped.length)}：</p>
          <ul className="mt-1 list-disc pl-5">
            {skipped.map((item) => (
              <li key={item.id}>
                「{item.name}」<span className="text-muted-foreground font-mono text-xs">{item.id}</span>：{describeBlockers(item.blockers)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
