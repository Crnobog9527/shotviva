import type { Locale } from '@/core/i18n'
import type { Translate } from '@/core/translate'
import { money, percent } from './format'
import type { Commission } from './models'
import { isRealBill, unrefundedBase, type FeeLine, type OrderFees } from './order-fees'
import { Table } from './shared-ui'

// "3.9% + $0.50", "$1.00", or a dash for a real-bill line that carries no published rate.
export function rateText(locale: Locale, line: Pick<FeeLine, 'rate_bp' | 'fixed_cents'>) {
  const parts = [
    line.rate_bp ? percent(locale, line.rate_bp) : null,
    line.fixed_cents ? money(locale, line.fixed_cents) : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' + ') : '—'
}

const label = (t: Translate, key: string, raw: string) => (t.has(key) ? t(key) : raw)

export function channelLabel(t: Translate, channel: string, method: string) {
  return label(t, `orderFees.channels.${channel}_${method}`, `${channel} ${method}`)
}

function LineTable({ order, locale, t }: { order: OrderFees; locale: Locale; t: Translate }) {
  const headers = ['channel', 'fee', 'rate', 'feeAmount', 'source', 'feeState'].map((key) => t('orderFees.' + key))
  return (
    <Table
      headers={headers}
      empty={t('orderFees.noLines')}
      rows={order.lines.map((line) => [
        channelLabel(t, line.channel, order.payment.method),
        label(t, 'orderFees.kinds.' + line.kind, line.kind),
        <span key="r" className="af-num">{rateText(locale, line)}</span>,
        <strong key="a" className="af-num">{money(locale, line.amount_cents)}</strong>,
        t(isRealBill(line) ? 'orderFees.sourceReal' : 'orderFees.sourceEstimate'),
        t('orderFees.state.' + line.status),
      ])}
    />
  )
}

function Sum({ order, row, locale, t }: { order: OrderFees; row: Commission; locale: Locale; t: Translate }) {
  const { payment } = order
  const refundShare = row.base_usd - unrefundedBase(payment)
  const facts: [string, string][] = [
    [t('orderFees.paid'), money(locale, payment.amount_total)],
    [t('orderFees.tax'), '− ' + money(locale, payment.amount_tax)],
    ...(refundShare > 0 ? [[t('orderFees.refunded'), '− ' + money(locale, refundShare)] as [string, string]] : []),
    [t('orderFees.fees'), '− ' + money(locale, row.fee_cents ?? 0)],
    [t('orderFees.netBase'), money(locale, row.net_base_usd ?? 0)],
  ]
  return (
    <dl className="af-fee-sum">
      {facts.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd className="af-num">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The expandable line under a commission row: the arithmetic, then every fee line behind it. */
export function OrderFeeDetail({ row, order, locale, t }: { row: Commission; order?: OrderFees; locale: Locale; t: Translate }) {
  if (row.fee_cents === null) return <p className="af-hint af-fee-note">{t('orderFees.legacy')}</p>
  if (!order) return null
  return (
    <details className="af-fee-detail">
      <summary>{t('orderFees.show', { count: order.lines.length })}</summary>
      <Sum order={order} row={row} locale={locale} t={t} />
      <LineTable order={order} locale={locale} t={t} />
      <p className="af-hint">{t(order.payment.fee_status === 'final' ? 'orderFees.noteFinal' : 'orderFees.noteEstimate')}</p>
    </details>
  )
}
