'use client'

import { useState } from 'react'

import type { ReplayOutcome, ReplayPreview } from '@/core/billing/stripe'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import { REPLAY_COPY as COPY } from './copy'
import { PreviewCard } from './preview-card'

export type ReplayActions = {
  preview: (input: { id: string }) => Promise<ActionValue<ReplayPreview>>
  apply: (input: { id: string }) => Promise<ActionValue<{ outcome: ReplayOutcome }>>
}

// Two steps on purpose (DESIGN §7 second confirmation): preview what Stripe says, then write.
export function ReplayPanel({ actions }: { actions: ReplayActions }) {
  const [id, setId] = useState('')
  const [preview, setPreview] = useState<ReplayPreview | null>(null)
  const { pending, error, notice, run } = useAdminAction()
  const lookUp = () => run(() => actions.preview({ id: id.trim() }), setPreview)
  const apply = (target: ReplayPreview) =>
    run(
      () => actions.apply({ id: target.id }),
      ({ outcome }) => {
        setPreview(null)
        return COPY.outcome[outcome]
      },
    )
  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{COPY.title}</h2>
      <p className="text-sm text-muted-foreground">{COPY.body}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          lookUp()
        }}
      >
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          <span className="font-medium">{COPY.label}</span>
          <Input value={id} onChange={(event) => setId(event.target.value)} placeholder={COPY.placeholder} className="min-w-56 font-mono" />
        </label>
        <Button type="submit" variant="outline" disabled={pending || id.trim().length === 0}>
          {COPY.preview}
        </Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {preview ? <PreviewCard preview={preview} pending={pending} onCancel={() => setPreview(null)} onConfirm={() => apply(preview)} /> : null}
    </section>
  )
}
