'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { seriesCopy as copy } from './copy'
import { planSeriesDelete, type SeriesListItem } from './list-rules'

type Props = { items: SeriesListItem[] | null; pending: boolean; production: boolean; onCancel: () => void; onConfirm: (ids: string[]) => void }

// 删除 one or several series (Owner 2026-11-14): it cannot be undone, so it says what goes, what
// is skipped and why, and how many templates move out, before anything is sent.
export function DeleteSeriesDialog({ items, pending, production, onCancel, onConfirm }: Props) {
  const plan = planSeriesDelete(items ?? [])
  return (
    <Dialog open={items !== null} onOpenChange={open => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.deleteTitle(plan.deletable.length || (items?.length ?? 0))}</DialogTitle>
          <DialogDescription>{copy.deleteBody}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-72 gap-3 overflow-auto text-sm">
          {plan.deletable.length > 0 ? (
            <div>
              <p className="font-medium">{copy.deleteWill(plan.deletable.length)}</p>
              <ul className="mt-1 list-disc pl-5">
                {plan.deletable.map(item => <li key={item.id}>{item.name_zh}<span className="text-muted-foreground">（{copy.memberCount(item.memberCount)}）</span></li>)}
              </ul>
              <p className="mt-2 font-medium">{copy.deleteMoved(plan.moved)}</p>
            </div>
          ) : <p>{copy.nothingToDelete}</p>}
          {plan.skipped.length > 0 && (
            <div className="text-muted-foreground">
              <p>{copy.deleteSkip(plan.skipped.length)}</p>
              <ul className="mt-1 list-disc pl-5">{plan.skipped.map(({ item, reason }) => <li key={item.id}>{item.name_zh}：{reason}</li>)}</ul>
            </div>
          )}
          {!production && plan.deletable.length > 0 && <p className="text-muted-foreground">{copy.deleteSync}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>{copy.cancel}</Button>
          <Button variant="destructive" disabled={pending || plan.deletable.length === 0}
            onClick={() => onConfirm(plan.deletable.map(item => item.id))}>{copy.deleteConfirm(plan.deletable.length)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
