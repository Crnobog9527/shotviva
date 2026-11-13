'use client'

import { Button } from '@/core/ui/button'

import { bulkMoreCopy as copy } from './bulk-more-copy'
import type { BulkTasks } from './use-bulk-tasks'

// What the last further batch action did, template by template; partial success is shown, not
// hidden. Also the short notes of 排序 and 复制 ID.
export function BulkTaskResult({ tasks }: { tasks: BulkTasks }) {
  const { result, message } = tasks
  if (message) return (
    <div role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-sm text-emerald-700' : 'text-destructive text-sm'}>
      <p>{message.text}</p>
      {message.ids ? <textarea readOnly className="mt-1 h-24 w-full rounded-md border p-2 font-mono text-xs" value={message.ids} /> : null}
    </div>
  )
  if (!result) return null
  const { task, outcome, names } = result
  const name = (id: string) => names.get(id) ?? id
  return (
    <section aria-live="polite" className="grid gap-2 rounded-lg border p-4 text-sm">
      <div className="flex items-center">
        <h2 className="font-medium">{copy.resultTitle}</h2>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={tasks.dismiss}>{copy.dismiss}</Button>
      </div>
      {outcome.done.length > 0 ? <p className="text-emerald-700">{copy.done(copy.label[task], outcome.done.length)}：{outcome.done.map(name).join('、')}</p> : null}
      {outcome.skipped.length > 0 ? (
        <div className="text-destructive">
          <p>{copy.failedSkip(outcome.skipped.length)}：</p>
          <ul className="mt-1 list-disc pl-5">
            {outcome.skipped.map(item => <li key={item.id}>「{name(item.id)}」<span className="text-muted-foreground font-mono text-xs">{item.id}</span>：{item.reason}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
