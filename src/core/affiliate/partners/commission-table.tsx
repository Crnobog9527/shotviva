import type { Locale } from '@/core/i18n'
import { Link } from '@/core/i18n/ui'
import type { Translate } from '@/core/translate'
import { date, money, percent, productLabel, viewHref } from './format'
import type { Commission, Query } from './models'
import { OrderFeeDetail } from './order-fee-detail'
import type { OrderFees } from './order-fees'
import { StatusPill, Table } from './shared-ui'

type Props = { rows: Commission[]; orders: Map<string, OrderFees>; query: Query; locale: Locale; t: Translate }

function cells({ orders, locale, t }: Props, row: Commission) {
  const order = orders.get(row.payment_id)
  return [
    date(locale, row.created_at),
    productLabel(row.product_id, t),
    money(locale, order?.payment.amount_total ?? row.base_usd),
    order ? money(locale, order.payment.amount_tax) : '—',
    row.fee_cents === null ? '—' : money(locale, row.fee_cents),
    row.net_base_usd === null ? '—' : <strong key="n" className="af-num">{money(locale, row.net_base_usd)}</strong>,
    percent(locale, row.rate_bp),
    <strong key="a" className="af-num">{money(locale, row.amount)}</strong>,
    <span key="s" className="af-state">
      <StatusPill status={row.status} t={t} />
      <small className="af-hint">
        {row.paused_hold ? t('orderFees.pausedHold') : t('orderFees.confirmsOn', { date: date(locale, row.confirm_after) })}
      </small>
    </span>,
  ]
}

/** One row per commission: paid, tax, fees, commission base, rate, commission; the fee lines expand under it. */
export function CommissionTable(props: Props) {
  const { rows, orders, locale, t } = props
  const headers = [
    'date', 'item', 'orderFees.paid', 'orderFees.tax', 'orderFees.fees', 'orderFees.netBase',
    'rate', 'commission', 'state',
  ].map((key) => t(key))
  return (
    <Table
      headers={headers}
      empty={t('empty')}
      rows={rows.map((row) => cells(props, row))}
      summaries={rows.map((row) => ({
        title: productLabel(row.product_id, t),
        meta: date(locale, row.created_at),
        value: money(locale, row.amount),
        badge: <StatusPill status={row.status} t={t} />,
      }))}
      details={rows.map((row) => (
        <div key={row.id} className="af-row-extra">
          <OrderFeeDetail row={row} order={orders.get(row.payment_id)} locale={locale} t={t} />
          <Link className="af-link" href={viewHref({ ...props.query, entry: String(row.id), changes: undefined })}>
            {t('detailsLink')}
          </Link>
        </div>
      ))}
    />
  )
}
