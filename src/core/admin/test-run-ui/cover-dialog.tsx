'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { TestRunView } from '../test-runs'
import { setCover } from './api'
import { TEST_RUN_COPY as COPY } from './copy'
import { failureMessage } from './messages'

type Props = { run: TestRunView | null; onClose: () => void; onDone: () => void; onError: (message: string) => void }

// 设为封面 (ARCHITECTURE §10.b): it changes what visitors see, so it asks first.
export function CoverDialog({ run, onClose, onDone, onError }: Props) {
  const [saving, setSaving] = useState(false)
  const confirm = async () => {
    if (!run) return
    setSaving(true)
    try {
      await setCover(run.id)
      onDone()
    } catch (error) {
      onError(failureMessage(error))
    } finally {
      setSaving(false)
      onClose()
    }
  }
  return (
    <Dialog open={run !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{COPY.cover.title}</DialogTitle>
          <DialogDescription>{COPY.cover.body}</DialogDescription>
        </DialogHeader>
        {run?.outputUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={run.outputUrl} alt="" className="bg-muted mx-auto max-h-64 rounded-md border object-contain" />
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {COPY.cover.cancel}
          </Button>
          <Button onClick={confirm} disabled={saving}>
            {saving ? COPY.cover.saving : COPY.cover.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
