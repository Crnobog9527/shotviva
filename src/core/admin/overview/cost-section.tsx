import Link from 'next/link'

import { costSummary, legacyEstimate, type UnitCost } from '../jobs/cost'
import { usdFine, usdTotal } from '../jobs/cost-format'
import { ModelStats } from '../jobs/model-stats'
import { StatCard } from '../shell/admin-blocks'
import { OVERVIEW_COPY } from './copy'
import type { DashboardStats, StatsWindow } from './stats'

const COPY = OVERVIEW_COPY.cost

function windowTitle(window: StatsWindow, days: number) {
  return window.key === 'period' ? OVERVIEW_COPY.windows.period(days) : OVERVIEW_COPY.windows[window.key]
}

function windowHint(window: StatsWindow, estimated: number, perImage: number | null) {
  const parts = [COPY.perImage(perImage === null ? '—' : usdFine.format(perImage))]
  if (estimated > 0) parts.push(COPY.estimated(usdTotal.format(estimated)))
  if (window.uncosted > 0) parts.push(COPY.uncosted(window.uncosted))
  return parts.join(' · ')
}

// Real generation cost per day: plain bars like the other trends, pre-T33 estimates included
// in the bar's label only.
function CostTrend({ trend, days, unitCost }: { trend: DashboardStats['trend']; days: number; unitCost: UnitCost }) {
  const totals = trend.map((day) => ({ day: day.day, real: day.cost_usd, estimated: legacyEstimate(day.legacy, unitCost) }))
  const max = Math.max(0.0001, ...totals.map((day) => day.real + day.estimated))
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold">{COPY.trendTitle(days)}</h3>
      <ol className="flex h-28 items-end gap-0.5" aria-label={COPY.trendTitle(days)}>
        {totals.map((day) => {
          const label = COPY.trendDay(day.day, usdTotal.format(day.real), day.estimated > 0 ? usdTotal.format(day.estimated) : null)
          return (
            <li key={day.day} className="flex h-full flex-1 flex-col justify-end" title={label} aria-label={label}>
              <div className="rounded-t-sm bg-muted-foreground/30" style={{ height: `${(day.estimated / max) * 100}%` }} />
              <div className="bg-primary" style={{ height: `${(day.real / max) * 100}%` }} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

type Props = { stats: DashboardStats; unitCost: UnitCost }

// Generation cost on the overview (ARCHITECTURE §10.0, T33): per window, per day, per model.
export function CostSection({ stats, unitCost }: Props) {
  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold">{COPY.title}</h2>
        <p className="text-xs text-muted-foreground">{COPY.note}</p>
        <Link href="/admin/costs" className="ml-auto text-sm text-primary hover:underline">
          {COPY.reconcile}
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {stats.windows.map((window) => {
          const cost = costSummary(window.cost_usd, legacyEstimate(window.legacy, unitCost), window.succeeded)
          return (
            <StatCard
              key={window.key}
              title={windowTitle(window, stats.days)}
              value={usdTotal.format(cost.total)}
              hint={windowHint(window, cost.estimated, cost.perImage)}
            />
          )
        })}
      </div>
      <CostTrend trend={stats.trend} days={stats.days} unitCost={unitCost} />
      <ModelStats usage={stats.by_model} days={stats.days} unitCost={unitCost} />
    </section>
  )
}
