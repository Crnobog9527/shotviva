'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { SUPPORT_COPY } from './copy'

type Props = {
  title: string
  body: string
  confirm: string
  pending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

// Second confirmation for the support writes (DESIGN §7). Their reason is fixed by the action
// itself (refund code, "补偿 job <id>"), so there is nothing to type.
export function ConfirmDialog({ title, body, confirm, pending, error, onCancel, onConfirm }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {SUPPORT_COPY.cancel}
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
