import { usdFine, usdTotal } from '../jobs/cost-format'
import { StatCard } from '../shell/admin-blocks'
import type { Billed } from './billed'
import { COSTS_COPY as COPY } from './copy'
import { CostsTable } from './costs-table'
import { KeyPanel, type CostKeyActions } from './key-panel'
import { reconcile, type OurDay } from './reconcile'
import type { AdminKeyStatus } from './repository'

type Props = { days: number; ours: OurDay[]; billed: Billed; keyStatus: AdminKeyStatus; actions: CostKeyActions }

function BilledNotice({ billed }: { billed: Billed }) {
  if (billed.status === 'ok') return null
  const text = billed.status === 'no_key' ? COPY.noKey : COPY.failed(billed.failure, billed.httpStatus)
  return (
    <p role="status" className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
      {text}
    </p>
  )
}

// /admin/costs (ARCHITECTURE §10.0, T33): OpenAI's billed cost per UTC day next to our summed
// cost_usd, with the difference. Read-only; the key entry sits below.
export function CostsView({ days, ours, billed, keyStatus, actions }: Props) {
  const { rows, totals } = reconcile(ours, billed.status === 'ok' ? billed.byDay : null)
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">{COPY.intro(days)}</p>
      <BilledNotice billed={billed} />
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard title={COPY.cards.billed} value={totals.billed === null ? COPY.dash : usdTotal.format(totals.billed)} hint={COPY.cards.scope(keyStatus.projectId)} />
        <StatCard title={COPY.cards.ours} value={usdTotal.format(totals.ours)} hint={COPY.cards.oursHint(totals.uncosted, totals.noUsage)} />
        <StatCard title={COPY.cards.difference} value={totals.difference === null ? COPY.dash : usdFine.format(totals.difference)} />
      </div>
      <CostsTable rows={rows} />
      <KeyPanel keyLast4={keyStatus.keyLast4} projectId={keyStatus.projectId} actions={actions} />
    </div>
  )
}
