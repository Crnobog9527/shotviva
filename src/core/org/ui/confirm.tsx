'use client'

import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirm: string
  cancel: string
  busy: boolean
  onConfirm: () => void
  children?: ReactNode
}

// A destructive step (remove a member, leave, reset the link) asks once more. The confirm button
// is the only thing that sends; the request id behind it is kept by the caller until it succeeds.
export function Confirm({ open, onOpenChange, title, description, confirm, cancel, busy, onConfirm, children }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2">
          <Button type="button" size="touch" variant="glass" disabled={busy} onClick={() => onOpenChange(false)}>{cancel}</Button>
          <Button type="button" size="touch" variant="destructive" disabled={busy} onClick={onConfirm}>{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
