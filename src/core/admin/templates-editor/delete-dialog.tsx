'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { AdminTemplate } from '../templates/types'
import { deleteCopy as copy } from './copy'

type Props = { template: AdminTemplate | null; pending: boolean; onCancel: () => void; onConfirm: () => void }

// 删除 an unpublished template (Owner 2026-11-13): it cannot be undone, so it says so and asks.
export function DeleteDialog({ template, pending, onCancel, onConfirm }: Props) {
  const name = template?.translations.zh?.name?.trim() || template?.name
  return (
    <Dialog open={template !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title(name ?? '')}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{copy.kept}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>{copy.cancel}</Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>{copy.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
