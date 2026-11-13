'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Textarea } from '@/core/ui/textarea'

import { seriesCopy as copy } from './copy'

export type BatchChoice = { field: 'is_active' | 'show_members'; value: boolean; label: string }
const CHOICES: BatchChoice[] = [
  { field: 'is_active', value: true, label: copy.batchPublish },
  { field: 'is_active', value: false, label: copy.batchUnpublish },
  { field: 'show_members', value: true, label: copy.batchShowOn },
  { field: 'show_members', value: false, label: copy.batchShowOff },
]

type Props = { names: string[]; pending: boolean; clear: () => void; apply: (choice: BatchChoice, reason: string | null) => void }

// Shown while series are checked: one flag for all of them, after a confirmation that lists them.
export function BatchBar({ names, pending, clear, apply }: Props) {
  const [choice, setChoice] = useState<BatchChoice | null>(null)
  const [reason, setReason] = useState('')
  const needsReason = choice?.field === 'is_active' && !choice.value
  const close = () => { setChoice(null); setReason('') }
  return (
    <div className="bg-muted/60 sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
      <span className="mr-2 font-medium">{copy.selected(names.length)}</span>
      {CHOICES.map(item => (
        <Button key={item.label} size="sm" variant="outline" disabled={pending} onClick={() => setChoice(item)}>{item.label}</Button>
      ))}
      <Button size="sm" variant="ghost" disabled={pending} onClick={clear}>{copy.clear}</Button>
      <Dialog open={!!choice} onOpenChange={open => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{choice && copy.batchTitle(choice.label, names.length)}</DialogTitle>
            <DialogDescription>{needsReason ? copy.confirmText : copy.productionNote}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 list-disc overflow-auto pl-5 text-sm">{names.map(name => <li key={name}>{name}</li>)}</ul>
          {needsReason && (
            <label className="grid gap-1 text-sm">{copy.batchReason}
              <Textarea value={reason} maxLength={500} onChange={event => setReason(event.target.value)} />
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>{copy.cancel}</Button>
            <Button disabled={pending || (needsReason && !reason.trim())}
              onClick={() => { if (choice) apply(choice, needsReason ? reason.trim() : null); close() }}>{copy.batchConfirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
