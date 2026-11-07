'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'

import { useAdminAction } from '../shell/use-admin-action'
import { DISPUTE_UI } from './copy'
import type { DisputeActions } from './types'

// The summary (uncategorized_text) is the field the Owner most often adds to: a reply from the
// user, a support ticket. Saving keeps it a draft (submit = false).
export function SupplementForm({ id, initial, save }: { id: string; initial: string; save: DisputeActions['saveText'] }) {
  const [text, setText] = useState(initial)
  const { pending, error, notice, run } = useAdminAction()
  const changed = text.trim() !== initial.trim()
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        run(() => save({ id, text }), () => DISPUTE_UI.saved)
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{DISPUTE_UI.supplementLabel}</span>
        <span className="text-muted-foreground">{DISPUTE_UI.supplementHint}</span>
        <Textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} maxLength={20000} className="font-mono text-xs" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending || !changed || text.trim().length === 0}>
          {DISPUTE_UI.save}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">{text.length} / 20000</span>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-success">{notice}</p> : null}
      </div>
    </form>
  )
}
