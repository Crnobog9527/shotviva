'use client'

import { Button } from '@/core/ui/button'

import { formatBeijing } from '../shell/format'
import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import { ORDERS_COPY } from './copy'
import { acknowledgeView, type AcknowledgeState, type AcknowledgeView } from './acknowledge-view'

const COPY = ORDERS_COPY.ack

type Result = { changed: boolean; acknowledgedAt: string | null }

export type AcknowledgeActions = {
  acknowledge: (input: { paymentId: string }) => Promise<ActionValue<Result>>
  unacknowledge: (input: { paymentId: string }) => Promise<ActionValue<Result>>
}

// The button undoes a live mark and marks anything else (unmarked, or a mark the payment moved past).
export const actionFor = (view: AcknowledgeView, actions: AcknowledgeActions) => (view.kind === 'marked' ? actions.unacknowledge : actions.acknowledge)

// Under the status of a refunded or disputed payment (1881): 「标记已知晓」, or the mark with
// 「撤销」. The server action refreshes the page, so the new state comes from the server.
export function AcknowledgeCell({ paymentId, state, actions }: { paymentId: string; state: AcknowledgeState; actions: AcknowledgeActions }) {
  const { pending, error, run } = useAdminAction()
  const view = acknowledgeView(state)
  if (view.kind === 'none') return null
  const click = () => run(() => actionFor(view, actions)({ paymentId }), () => undefined)
  return (
    <span className="grid gap-1 text-xs">
      {view.kind === 'marked' ? <span className="whitespace-nowrap text-muted-foreground">{COPY.done(formatBeijing(view.at) ?? view.at)}</span> : null}
      {view.kind === 'stale' ? <span className="text-destructive">{COPY.stale}</span> : null}
      {view.openDispute ? <span className="text-destructive">{COPY.openDispute}</span> : null}
      <Button type="button" size="sm" variant="outline" title={COPY.hint} onClick={click} disabled={pending}>
        {pending ? COPY.pending : view.kind === 'marked' ? COPY.undo : COPY.button}
      </Button>
      {error ? <span className="text-destructive">{error}</span> : null}
    </span>
  )
}
