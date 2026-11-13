import { usdTotal } from '../jobs/cost-format'
import { StatCard } from '../shell/admin-blocks'
import type { Billed, ProviderBills } from './billed'
import { COSTS_COPY as COPY } from './copy'
import { CostsTable } from './costs-table'
import { KeyPanel, type CostKeyActions } from './key-panel'
import { COST_PROVIDERS, type CostProvider } from './provider-days'
import { reconcile, STALE_DRIFT, type OurDay, type PriceDrift } from './reconcile'
import type { AdminKeyStatus } from './repository'

type Props = { days: number; ours: Record<CostProvider, OurDay[]>; bills: ProviderBills; keyStatus: AdminKeyStatus; actions: CostKeyActions }

const yuan = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function BilledNotice({ provider, billed }: { provider: CostProvider; billed: Billed }) {
  if (billed.status === 'ok') return null
  const text = billed.status === 'no_key' ? COPY.noKey[provider]
    : billed.status === 'not_connected' ? COPY.notConnected
      : COPY.failed(provider, billed.failure, billed.httpStatus, billed.code)
  return (
    <p role="status" className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
      {text}
    </p>
  )
}

// Several days in a row off by more than STALE_DRIFT: prices are likely out of date (§10.0).
function DriftNotice({ provider, drift }: { provider: CostProvider; drift: PriceDrift | null }) {
  if (!drift) return null
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">
      {COPY.drift(provider, drift.days, drift.from, drift.to, Math.round(STALE_DRIFT * 100))}
    </p>
  )
}

type SectionProps = { provider: CostProvider; ours: OurDay[]; billed: Billed; projectId: string | null }

// One provider: its bill next to what we recorded for it, same layout for all three.
function ProviderSection({ provider, ours, billed, projectId }: SectionProps) {
  const { rows, totals, drift } = reconcile(ours, billed.status === 'ok' ? billed.byDay : null, { pendingToday: provider === 'openrouter' })
  const note = COPY.scopeNote[provider]
  const oursHint = [
    COPY.cards.jobs(totals.jobs), COPY.cards.tests(usdTotal.format(totals.tests)),
    ...(provider === 'ark' ? [COPY.cards.cny(yuan.format(totals.oursCny))] : []),
  ].join('，')
  return (
    <section id={`costs-${provider}`} aria-labelledby={`costs-${provider}-title`} className="grid scroll-mt-20 gap-4">
      <h2 id={`costs-${provider}-title`} className="text-lg font-semibold">{COPY.name(provider)}</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        <span className="text-foreground">{note[0]}</span>
        {note.slice(1).join('')}
      </p>
      <BilledNotice provider={provider} billed={billed} />
      <DriftNotice provider={provider} drift={drift} />
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard title={COPY.cards.billed(provider)} value={totals.billed === null ? COPY.dash : usdTotal.format(totals.billed)} hint={COPY.cards.scope(provider, projectId)} />
        <StatCard title={COPY.cards.ours} value={usdTotal.format(totals.ours)} hint={`${oursHint}；${COPY.cards.oursHint(totals.uncosted, totals.noUsage)}`} />
        <StatCard title={COPY.cards.difference(provider)} value={totals.difference === null ? COPY.dash : usdTotal.format(totals.difference)} />
      </div>
      <CostsTable rows={rows} showCny={provider === 'ark'} />
    </section>
  )
}

// /admin/costs (ARCHITECTURE §10.0, T33): per image provider, its billed cost per UTC day next to
// what we recorded for it, with the difference. Read-only; the OpenAI key entry sits at the end.
export function CostsView({ days, ours, bills, keyStatus, actions }: Props) {
  return (
    <div className="grid gap-10">
      <div className="grid max-w-3xl gap-2 text-sm text-muted-foreground">
        <p>{COPY.intro(days)}</p>
        <nav aria-label={COPY.title} className="flex flex-wrap gap-3">
          <span>{COPY.nav}</span>
          {COST_PROVIDERS.map((provider) => (
            <a key={provider} href={`#costs-${provider}`} className="text-foreground underline underline-offset-4">{COPY.name(provider)}</a>
          ))}
        </nav>
      </div>
      {COST_PROVIDERS.map((provider) => (
        <ProviderSection key={provider} provider={provider} ours={ours[provider]} billed={bills[provider]} projectId={keyStatus.projectId} />
      ))}
      <KeyPanel keyLast4={keyStatus.keyLast4} projectId={keyStatus.projectId} actions={actions} />
    </div>
  )
}
