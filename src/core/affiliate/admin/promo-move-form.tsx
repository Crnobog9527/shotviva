'use client'
import { useActionState } from 'react'
import { Button } from '@/core/ui/button'
import { COPY } from './copy'
import type { SaveAction } from './form'
import { MOVE_COPY as M, type MovePreview } from './promo-move-copy'

// The 「迁移本月旧发放」 block of one partner: the amount the page shows is sent back, so the database
// refuses if it changed since ('changed'); a second click finds nothing left to move.
type Props = { action: SaveAction; orgId: string; orgName: string; preview: MovePreview }

export function PromoMoveForm({ action, orgId, orgName, preview }: Props) {
  const [message, submit, busy] = useActionState(action, '')
  return (
    <form
      action={submit}
      onSubmit={(event) => { if (!window.confirm(M.confirmAsk(orgName, preview.credits))) event.preventDefault() }}
      className="grid gap-2 rounded-lg border border-dashed border-border p-4 text-sm">
      <input type="hidden" name="operation" value="promoMove" />
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="credits" value={String(preview.credits)} />
      <p className="font-medium">{M.title}</p>
      <p className="text-muted-foreground">{M.hint}</p>
      {preview.moved > 0 ? <p>{M.moved(preview.moved)}</p> : null}
      {preview.credits > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{M.amount(preview.credits)}</span>
          <Button type="submit" size="sm" disabled={busy}>{busy ? COPY.saving : M.submit}</Button>
        </div>
      ) : <p className="text-muted-foreground">{M.nothing}</p>}
      <span role="status" className="text-muted-foreground">{message}</span>
    </form>
  )
}
