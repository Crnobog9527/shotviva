'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'

import { useAdminAction } from '../shell/use-admin-action'
import { DISPUTE_UI } from './copy'
import type { DisputeActions } from './types'

type Slot = { field: string; label: string }

// The browser PUTs the file to the private bucket (presigned), then the server hands it to
// Stripe: no file bytes pass a function body (AGENTS §6).
async function upload(actions: DisputeActions, id: string, field: string, file: File) {
  const ticket = await actions.createUpload({ id, contentType: file.type, size: file.size })
  if (!ticket.ok) return ticket
  const put = await fetch(ticket.value.putUrl, { method: 'PUT', headers: ticket.value.headers, body: file })
  if (!put.ok) return { ok: false, code: 'INTERNAL', message: '上传失败，请重试' } as const
  return actions.attach({ id, key: ticket.value.key, field })
}

export function AttachForm({ id, slots, actions }: { id: string; slots: readonly Slot[]; actions: DisputeActions }) {
  const [field, setField] = useState(slots[0]?.field ?? '')
  const [file, setFile] = useState<File | null>(null)
  const { pending, error, notice, run } = useAdminAction()
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (file) run(() => upload(actions, id, field, file), () => DISPUTE_UI.attached)
      }}
    >
      <p className="text-sm text-muted-foreground">{DISPUTE_UI.attachHint}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{DISPUTE_UI.attachField}</span>
          <select className="h-9 rounded-md border border-input bg-transparent px-3" value={field} onChange={(e) => setField(e.target.value)}>
            {slots.map((slot) => (
              <option key={slot.field} value={slot.field}>
                {slot.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="font-medium">{DISPUTE_UI.attachFile}</span>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="max-w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1.5"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="submit" variant="outline" disabled={pending || !file}>
          {DISPUTE_UI.attach}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
    </form>
  )
}
