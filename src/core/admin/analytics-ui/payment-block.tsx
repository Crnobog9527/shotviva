import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { readPayment } from '../analytics/load'
import { sqlEditorLink } from '../analytics/links'
import { methodsQuery, type Payment } from '../analytics/payment'
import { StatCard } from '../shell/admin-blocks'
import { ANALYTICS_COPY } from './copy'
import { n, pct, pointDelta } from './format'
import { BlockFrame, DeltaText, Empty, MetricLabel, Unavailable } from './parts'

const COPY = ANALYTICS_COPY.payment
const NUM = 'text-right font-mono tabular-nums'

function Head({ id, metric }: { id: string; metric: { label: string; help: string } }) {
  return (
    <TableHead className="text-right whitespace-nowrap">
      <MetricLabel id={id} metric={metric} className="justify-end" />
    </TableHead>
  )
}

function Picks({ payment }: { payment: Payment }) {
  if (payment.picks.length === 0) return <Empty text={COPY.noPicks} />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.product}</TableHead>
          {(['picks', 'pickers', 'wentToPay', 'payRate'] as const).map((key) => (
            <Head key={key} id={`payment-${key}`} metric={COPY.metrics[key]} />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {payment.picks.map((row) => (
          <TableRow key={row.productId}>
            <TableCell className="whitespace-nowrap">{ANALYTICS_COPY.products[row.productId] ?? row.productId}</TableCell>
            <TableCell className={NUM}>{n(row.picks)}</TableCell>
            <TableCell className={NUM}>{n(row.pickers)}</TableCell>
            <TableCell className={NUM}>{n(row.wentToPay)}</TableCell>
            <TableCell className={NUM}>{pct(row.payRate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Methods({ payment }: { payment: Payment }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.method}</TableHead>
          {(['started', 'paid', 'successRate'] as const).map((key) => (
            <Head key={key} id={`payment-${key}`} metric={COPY.metrics[key]} />
          ))}
          <TableHead className="text-right whitespace-nowrap">{COPY.previous}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payment.methods.map((row) => (
          <TableRow key={row.method}>
            <TableCell className="whitespace-nowrap">{COPY.methods[row.method]}</TableCell>
            <TableCell className={NUM}>{n(row.current.started)}</TableCell>
            <TableCell className={NUM}>{n(row.current.paid)}</TableCell>
            <TableCell className={NUM}>
              {pct(row.current.payRate)} <DeltaText delta={pointDelta(row.current.payRate, row.previous.payRate)} />
            </TableCell>
            <TableCell className={`${NUM} text-muted-foreground`}>{pct(row.previous.payRate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function PaymentView({ payment }: { payment: Payment }) {
  const cancels = payment.cancels
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{COPY.picksTitle}</h3>
        <Picks payment={payment} />
      </div>
      <Methods payment={payment} />
      <div className="max-w-xs">
        <StatCard title={COPY.metrics.cancels.label} value={n(cancels.current)} hint={ANALYTICS_COPY.previousTimes(n(cancels.previous))} />
        <p className="mt-2 text-xs text-muted-foreground">{COPY.metrics.cancels.help}</p>
      </div>
    </div>
  )
}

export async function PaymentBlock({ query, projectId }: { query: { range: Parameters<typeof readPayment>[0] }; projectId: string }) {
  const block = await readPayment(query.range)
  const links = block.status === 'ok' ? [{ href: sqlEditorLink(projectId, methodsQuery(block.window)), label: ANALYTICS_COPY.openInPostHog }] : []
  return (
    <BlockFrame title={COPY.title} desc={COPY.desc} links={links}>
      {block.status === 'ok' ? <PaymentView payment={block.data} /> : <Unavailable />}
    </BlockFrame>
  )
}
