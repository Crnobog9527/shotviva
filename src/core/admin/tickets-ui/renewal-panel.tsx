'use client'

import { useState } from 'react'

import type { RenewalReview } from '@/core/support'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { TICKETS_COPY } from './copy'
import { toCents } from './refund-decision-form'
import { useTicketAction, type TicketAdminActions } from './use-ticket-action'

const copy = TICKETS_COPY.renewal
const dollars = (cents: number | null) => cents === null ? '' : (cents / 100).toFixed(2)
const evidence = (cents: number | null, currency: string | null) =>
  cents === null || !currency ? copy.missing : dollars(cents) + ' ' + currency.toUpperCase()

type Props = { ticketId: string; review: RenewalReview; resolve: NonNullable<TicketAdminActions['resolveRenewal']> }

export function RenewalPanel({ ticketId, review, resolve }: Props) {
  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{copy.heading}</h2>
      <p>{review.reason === 'duplicate_payment' ? copy.duplicate : copy.amountMismatch}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {[[copy.order, review.order], [copy.payment, review.payment], [copy.period, review.period],
          [copy.quote, dollars(review.quoted)], [copy.charge, evidence(review.charged, review.currency)],
          [copy.tax, evidence(review.tax, review.currency)]].map(([label, value]) => (
          <div key={label} className="contents"><dt>{label}</dt><dd className="break-all">{value}</dd></div>
        ))}
      </dl>
      {review.resolution ? <p>{copy[review.resolution]}</p> : <DecisionForm ticketId={ticketId} review={review} resolve={resolve} />}
    </section>
  )
}

const initialAmount = (review: RenewalReview, cents: number | null) => dollars(review.currency === 'usd' ? cents : null)
const taxAmount = (value: string) => /^0+(\.0{1,2})?$/.test(value.trim()) ? 0 : toCents(value)

function DecisionForm({ ticketId, review, resolve }: Props) {
  const [total, setTotal] = useState(initialAmount(review, review.charged))
  const [tax, setTax] = useState(initialAmount(review, review.tax))
  const totalCents = toCents(total)
  const taxCents = taxAmount(tax)
  const valid = totalCents !== null && taxCents !== null && totalCents > taxCents
  const action = useTicketAction()
  return (
    <div className="grid gap-3">
      <p className="text-sm">{review.period_paid ? copy.alreadyPaid : copy.verify}</p>
      {!review.period_paid && <div className="flex flex-wrap gap-3">
        <label>{copy.totalUsd}<Input inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} /></label>
        <label>{copy.taxUsd}<Input inputMode="decimal" value={tax} onChange={e => setTax(e.target.value)} /></label>
      </div>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={action.pending || review.period_paid || !valid} onClick={() => valid && action.run(
          () => resolve({ ticketId, decision: 'settled', total: totalCents, tax: taxCents }), copy.done)}>
          {copy.settle}
        </Button>
        <Button variant="secondary" disabled={action.pending} onClick={() => action.run(
          () => resolve({ ticketId, decision: 'refunded' }), copy.done)}>{copy.refund}</Button>
      </div>
      {action.error && <p role="alert">{action.error}</p>}
      {action.notice && <p role="status">{action.notice}</p>}
    </div>
  )
}
