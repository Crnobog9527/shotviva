'use client'

import type { AdminAnnouncementRow } from '@/core/announcements/rules'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { ANNOUNCEMENTS_COPY } from './copy'

type Props = {
  target: AdminAnnouncementRow | null
  // Active rows the switch would stop (on screen); shown before confirming (ARCHITECTURE §10).
  stops: AdminAnnouncementRow[]
  pending: boolean
  onCancel: () => void
  onConfirm: (target: AdminAnnouncementRow) => void
}

export function SwitchDialog({ target, stops, pending, onCancel, onConfirm }: Props) {
  const copy = target?.is_active ? ANNOUNCEMENTS_COPY.deactivateDialog : ANNOUNCEMENTS_COPY.activateDialog
  const activating = target !== null && !target.is_active
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {target ? <p className="rounded-md bg-muted p-3 text-sm">{target.message_zh}</p> : null}
        {activating && stops.length > 0 ? (
          <p className="text-sm text-destructive">{ANNOUNCEMENTS_COPY.activateDialog.stops(stops.map((row) => `「${row.message_zh}」`))}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {copy.cancel}
          </Button>
          <Button disabled={pending || target === null} onClick={() => target && onConfirm(target)}>
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
