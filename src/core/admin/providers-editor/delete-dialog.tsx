'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { AdminProvider } from '../providers/types'

import { PROVIDERS_COPY } from './copy'

const COPY = PROVIDERS_COPY.deleteDialog

type Props = { target: AdminProvider | null; pending: boolean; onCancel: () => void; onConfirm: (target: AdminProvider) => void }

// Deleting removes the row and its Vault key for good, so it is confirmed with the provider's
// name and model on screen (ARCHITECTURE §3.3).
export function DeleteDialog({ target, pending, onCancel, onConfirm }: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{target ? COPY.body(target.label, target.model) : null}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.cancel}
          </Button>
          <Button variant="destructive" disabled={pending || target === null} onClick={() => target && onConfirm(target)}>
            {COPY.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
