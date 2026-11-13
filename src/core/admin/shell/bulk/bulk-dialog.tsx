'use client'

import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { BULK_COPY as COPY } from './copy'

type Props = { title: string; description: string; pending: boolean; error: string | null; finished: boolean; onClose: () => void; confirm: ReactNode; children?: ReactNode }

// The frame of a batch's confirm dialog. While it runs it cannot be dismissed; once finished the
// only button left is 完成, so the per-record result is read before the dialog goes away.
export function BulkDialog({ title, description, pending, error, finished, onClose, confirm, children }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          {finished ? (
            <Button onClick={onClose}>{COPY.finish}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={pending}>
                {COPY.cancel}
              </Button>
              {confirm}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
