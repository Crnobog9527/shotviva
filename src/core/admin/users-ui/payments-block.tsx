import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { ClawbackStatus } from '../clawback-ui'
import { stripeDashboardUrl } from '../orders/source'
import { formatBeijing } from '../shell/format'
import { DETAIL_ROWS, type UserPayment } from '../users/detail-types'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.extras
const COLUMNS = ['createdAt', 'product', 'amount', 'tax', 'refunded', 'credits', 'method', 'status', 'link'] as const

// Minor units to a display amount. Currencies differ under Adaptive Pricing (T10 notes), and
// some (JPY, KRW) have no minor unit, so the divisor comes from the currency itself.
function money(minor: number, currency: string): string {
  const format = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currency.toUpperCase() })
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2))
}

function ProviderLink({ payment, stripeLive }: { payment: UserPayment; stripeLive: boolean }) {
  if (!payment.providerId) return <span>—</span>
  if (payment.channel !== 'stripe') return <span className="font-mono text-xs">{payment.providerId}</span>
  return (
    <a href={stripeDashboardUrl(payment.providerId, stripeLive)} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary hover:underline">
      {payment.providerId.slice(0, 18)}…
    </a>
  )
}

export function PaymentsBlock({ payments, stripeLive }: { payments: UserPayment[]; stripeLive: boolean }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{COPY.payments(DETAIL_ROWS)}</h2>
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.noPayments}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column}>{COPY.paymentColumns[column]}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(payment.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs">{payment.productId}</TableCell>
                <TableCell className="font-mono text-xs">{money(payment.amountTotal, payment.currency)}</TableCell>
                <TableCell className="font-mono text-xs">{money(payment.amountTax, payment.currency)}</TableCell>
                <TableCell className="font-mono text-xs">{payment.amountRefunded > 0 ? money(payment.amountRefunded, payment.currency) : ''}</TableCell>
                <TableCell>
                  <ClawbackStatus clawedBack={payment.creditsClawedBack} shortfall={payment.clawbackShortfall} />
                </TableCell>
                <TableCell className="text-xs">{COPY.methods[payment.method] ?? payment.method}</TableCell>
                <TableCell className="text-xs">{COPY.paymentStatus[payment.status] ?? payment.status}</TableCell>
                <TableCell>
                  <ProviderLink payment={payment} stripeLive={stripeLive} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
