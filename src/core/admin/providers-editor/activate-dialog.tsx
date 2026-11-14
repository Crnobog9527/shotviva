'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { AdminProvider } from '../providers/types'

import { PROVIDERS_COPY } from './copy'

const COPY = PROVIDERS_COPY.activateDialog

type Props = {
  target: AdminProvider | null
  // The provider in use now in the target's module; null means none (env fallback for image).
  current: AdminProvider | null
  pending: boolean
  onCancel: () => void
  onConfirm: (target: AdminProvider) => void
}

// Switching changes which vendor and model every next generation calls, so it is confirmed with
// both names on screen (ARCHITECTURE §3.3).
export function ActivateDialog({ target, current, pending, onCancel, onConfirm }: Props) {
  const kind = target?.module ?? 'image'
  const from = current ? `${current.label} · ${current.model}` : COPY.fromNone[kind]
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.title(kind)}</DialogTitle>
          <DialogDescription>
            {target ? COPY.body(from, target.label, target.model) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.cancel}
          </Button>
          <Button disabled={pending || target === null} onClick={() => target && onConfirm(target)}>
            {COPY.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
