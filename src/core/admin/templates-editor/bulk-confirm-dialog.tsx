'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

import type { AdminTemplate } from '../templates/types'
import { bulkCopy } from './copy'

type Props = {
  // null = closed; otherwise the direction asked for.
  active: boolean | null
  templates: AdminTemplate[]
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: string | undefined) => void
}

// Names every template before a bulk change; unpublishing also needs a reason, as the switch does.
export function BulkConfirmDialog({ active, templates, pending, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const unpublishing = active === false
  const featured = templates.filter((template) => template.featuredRank !== null && template.isActive)
  const close = () => {
    setReason('')
    onCancel()
  }
  return (
    <Dialog open={active !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bulkCopy.title(active ?? true, templates.length)}</DialogTitle>
          <DialogDescription>{unpublishing ? bulkCopy.unpublishHint : bulkCopy.publishHint}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-60 overflow-y-auto rounded-md border p-3 text-sm">
          {templates.map((template) => (
            <li key={template.id} className="flex justify-between gap-3 py-0.5">
              <span>{template.name}</span>
              <span className="text-muted-foreground font-mono text-xs">{template.id}</span>
            </li>
          ))}
        </ul>
        {unpublishing && featured.length > 0 ? (
          <p className="text-sm text-amber-700">{bulkCopy.featuredNote(featured.map((t) => `「${t.name}」`).join('、'))}</p>
        ) : null}
        {unpublishing ? (
          <div className="grid gap-2">
            <Label htmlFor="bulk-unpublish-reason">{bulkCopy.reasonLabel}</Label>
            <Textarea id="bulk-unpublish-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>
            {bulkCopy.cancel}
          </Button>
          <Button
            variant={unpublishing ? 'destructive' : 'default'}
            disabled={pending || (unpublishing && reason.trim().length === 0)}
            onClick={() => {
              onConfirm(unpublishing ? reason.trim() : undefined)
              setReason('')
            }}
          >
            {bulkCopy.confirm(!unpublishing)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
