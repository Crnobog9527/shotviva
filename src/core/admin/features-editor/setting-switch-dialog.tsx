'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { SwitchCopy } from './switch-copy'

type Props = {
  copy: SwitchCopy
  // The state the switch would move to; null while the dialog is closed.
  target: boolean | null
  pending: boolean
  onCancel: () => void
  onConfirm: (enabled: boolean) => void
}

// What turning a switch on or off does, shown before saving (T62, T108).
export function SettingSwitchDialog({ copy: COPY, target, pending, onCancel, onConfirm }: Props) {
  const copy = target ? COPY.dialog.on : COPY.dialog.off
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.dialog.cancel}
          </Button>
          <Button
            variant={target ? 'default' : 'destructive'}
            disabled={pending || target === null}
            onClick={() => target !== null && onConfirm(target)}
          >
            {pending ? COPY.saving : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
