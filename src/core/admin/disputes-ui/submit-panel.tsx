'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { useAdminAction } from '../shell/use-admin-action'
import { DISPUTE_UI } from './copy'
import { useDraftState } from './draft-state'
import type { DisputeActions } from './types'

// Second confirmation (DESIGN §7): the button opens a dialog, and its confirm stays off until the
// Owner ticks that they checked the evidence. Stripe takes one submission; the server refuses a
// second one as well.
export function SubmitPanel({ id, amount, submit }: { id: string; amount: string; submit: DisputeActions['submit'] }) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)
  const { pending, error, run } = useAdminAction()
  const { dirty } = useDraftState()
  const unsaved = dirty.summary || dirty.file
  const close = () => {
    setOpen(false)
    setChecked(false)
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{DISPUTE_UI.submitBody}</p>
      <Button className="h-11 w-full sm:h-9 sm:w-auto sm:justify-self-start" onClick={() => setOpen(true)}>
        {DISPUTE_UI.submit}
      </Button>
      {open ? (
        <Dialog open onOpenChange={(next) => !next && close()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{DISPUTE_UI.confirmTitle}</DialogTitle>
              <DialogDescription>{DISPUTE_UI.confirmBody(amount)}</DialogDescription>
            </DialogHeader>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} className="mt-0.5" />
              <span>{DISPUTE_UI.confirmCheck}</span>
            </label>
            {unsaved ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{DISPUTE_UI.unsaved(dirty)}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button variant="outline" className="h-11 sm:h-9" onClick={close} disabled={pending}>
                {DISPUTE_UI.cancel}
              </Button>
              <Button variant="destructive" className="h-11 sm:h-9" disabled={pending || !checked || unsaved} onClick={() => run(() => submit({ id }), () => close())}>
                {DISPUTE_UI.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
