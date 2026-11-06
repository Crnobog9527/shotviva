import type { AdminPayment, RefundEligibility } from '@/core/support'

import { stripeDashboardUrl } from '../orders/source'
import { formatBeijing } from '../shell/format'
import { TICKETS_COPY as COPY } from './copy'
import { RefundDecisionForm } from './refund-decision-form'
import type { TicketAdminActions } from './use-ticket-action'

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)

// The charge is what a refund is made on; a session or invoice id finds it too.
function stripeId(payment: AdminPayment): string | null {
  return payment.stripeChargeId ?? payment.stripeInvoiceId ?? payment.stripeSessionId
}

// Where the Owner makes the refund. Stripe search by id; Waffo by order number in its dashboard.
function ProviderLink({ payment, stripeLive }: { payment: AdminPayment; stripeLive: boolean }) {
  const id = stripeId(payment)
  if (payment.channel === 'stripe' && id) {
    return (
      <a href={stripeDashboardUrl(id, stripeLive)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
        {COPY.payment.openInStripe}
      </a>
    )
  }
  return payment.waffoOrderId ? <p className="text-sm text-muted-foreground">{COPY.payment.waffoHint(payment.waffoOrderId)}</p> : null
}

export function PaymentFacts({ payment, stripeLive }: { payment: AdminPayment; stripeLive: boolean }) {
  const rows: [string, string][] = [
    [COPY.payment.product, payment.productId],
    [COPY.payment.total, money(payment.amountTotal, payment.currency)],
    [COPY.payment.tax, money(payment.amountTax, payment.currency)],
    [COPY.payment.refunded, money(payment.amountRefunded, payment.currency)],
    [COPY.payment.method, payment.method],
    [COPY.payment.channel, payment.channel],
    [COPY.payment.status, payment.status],
    [COPY.payment.createdAt, formatBeijing(payment.createdAt) ?? '—'],
  ]
  return (
    <section className="grid gap-2 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{COPY.payment.heading}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono">{value}</dd>
          </div>
        ))}
      </dl>
      <ProviderLink payment={payment} stripeLive={stripeLive} />
    </section>
  )
}

type PanelProps = {
  ticketId: string
  payment: AdminPayment
  eligibility: RefundEligibility
  decided: { decision: 'approved' | 'rejected'; amountCents: number | null } | null
  decide: TicketAdminActions['decide']
}

// The three policy checks as hints, the suggested amount, and the decision (ARCHITECTURE §10).
export function RefundPanel({ ticketId, payment, eligibility, decided, decide }: PanelProps) {
  const checks = [
    [COPY.refund.checks.firstPurchase, eligibility.firstPurchase],
    [COPY.refund.checks.within7Days, eligibility.within7Days],
    [COPY.refund.checks.noCreditsUsed, eligibility.noCreditsUsed],
  ] as const
  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{COPY.refund.heading}</h2>
      <ul className="grid gap-1 text-sm">
        {checks.map(([label, ok]) => (
          <li key={label} className="flex gap-2">
            <span className={ok ? 'text-primary' : 'text-destructive'}>{ok ? COPY.refund.yes : COPY.refund.no}</span>
            {label}
          </li>
        ))}
      </ul>
      <p className="text-sm">
        {COPY.refund.suggested}：<span className="font-mono font-semibold">{money(eligibility.suggestedCents, payment.currency)}</span>
      </p>
      {decided && (
        <p className="text-sm text-muted-foreground">
          {COPY.refund.decided(COPY.decisions[decided.decision], decided.amountCents === null ? null : money(decided.amountCents, payment.currency))}
        </p>
      )}
      <RefundDecisionForm ticketId={ticketId} suggestedCents={eligibility.suggestedCents} decide={decide} />
      <p className="text-xs text-muted-foreground">{COPY.refund.afterApprove}</p>
    </section>
  )
}
