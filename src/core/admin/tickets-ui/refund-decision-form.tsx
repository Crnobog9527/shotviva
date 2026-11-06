'use client'

import { useState } from 'react'

import { BODY_MAX } from '@/core/support/rules'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'

import { TICKETS_COPY as COPY } from './copy'
import { useTicketAction, type TicketAdminActions } from './use-ticket-action'

type Props = { ticketId: string; suggestedCents: number; decide: TicketAdminActions['decide'] }

// Dollars as typed ("18.80") to cents; anything else is not a positive amount.
export function toCents(dollars: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(dollars.trim())) return null
  const cents = Math.round(Number(dollars.trim()) * 100)
  return cents > 0 ? cents : null
}

// Approve with an amount (prefilled with the suggestion, editable: e.g. no fee where the law
// does not allow one) or reject, with a reply either way. Only records the decision: the money
// moves in the Stripe / Waffo dashboard.
export function RefundDecisionForm({ ticketId, suggestedCents, decide }: Props) {
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [amount, setAmount] = useState((suggestedCents / 100).toFixed(2))
  const [body, setBody] = useState('')
  const action = useTicketAction()
  const cents = toCents(amount)
  const ready = body.trim().length > 0 && (decision === 'rejected' || cents !== null)

  const submit = () =>
    action.run(
      () => decide(decision === 'approved' ? { ticketId, decision, amountCents: cents ?? 0, body } : { ticketId, decision, body }),
      COPY.refund.done,
      () => setBody(''),
    )

  return (
    <div className="grid gap-3">
      <fieldset className="flex flex-wrap gap-4">
        {(['approved', 'rejected'] as const).map((value) => (
          <label key={value} className="flex min-h-10 items-center gap-2 text-sm">
            <input type="radio" name="refund-decision" checked={decision === value} onChange={() => setDecision(value)} />
            {value === 'approved' ? COPY.refund.approve : COPY.refund.reject}
          </label>
        ))}
      </fieldset>
      {decision === 'approved' && (
        <label className="grid max-w-xs gap-1 text-sm">
          {COPY.refund.amount}
          <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={cents === null} />
        </label>
      )}
      <label className="grid gap-1 text-sm">
        {COPY.refund.replyLabel}
        <Textarea value={body} maxLength={BODY_MAX} rows={4} onChange={(event) => setBody(event.target.value)} />
      </label>
      <Button type="button" className="justify-self-start" disabled={action.pending || !ready} onClick={submit}>
        {COPY.refund.submit}
      </Button>
      {action.error && <p role="alert" className="text-sm text-destructive">{action.error}</p>}
      {action.notice && <p role="status" className="text-sm text-muted-foreground">{action.notice}</p>}
    </div>
  )
}
