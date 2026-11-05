import { usd } from '../orders/money'
import type { RevenueStats } from '../orders/revenue'
import { StatCard } from '../shell/admin-blocks'
import { OVERVIEW_COPY as COPY } from './copy'
import { successRate, type DashboardStats, type StatsWindow } from './stats'
import { RevenueTrend, TrendChart } from './trend-chart'

const number = new Intl.NumberFormat('zh-CN')
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

function windowTitle(window: StatsWindow, days: number) {
  return window.key === 'period' ? COPY.windows.period(days) : COPY.windows[window.key]
}

function WindowCards({ window, days, revenue }: { window: StatsWindow; days: number; revenue: RevenueStats }) {
  const money = revenue.windows.find((w) => w.key === window.key)
  const rate = successRate(window)
  const used = window.free_credits_used + window.paid_credits_used
  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{windowTitle(window, days)}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title={COPY.cards.signups} value={number.format(window.signups)} />
        <StatCard title={COPY.cards.jobs} value={number.format(window.jobs)} />
        <StatCard
          title={COPY.cards.successRate}
          value={rate === null ? '—' : percent.format(rate)}
          hint={COPY.cards.successHint(window.succeeded, window.failed)}
        />
        <StatCard
          title={COPY.cards.credits}
          value={number.format(used)}
          hint={COPY.cards.creditsHint(window.free_credits_used, window.paid_credits_used)}
        />
        <StatCard title={COPY.cards.newPaying} value={number.format(window.new_paying_users)} />
        {/* admin_revenue_stats: list price, the orders page has the detail. */}
        <StatCard
          title={COPY.cards.revenue}
          value={money ? usd.format(money.revenue_usd) : '—'}
          hint={money ? COPY.cards.revenueHint(money.purchases) : undefined}
        />
      </div>
    </section>
  )
}

export function OverviewView({ stats, revenue }: { stats: DashboardStats; revenue: RevenueStats }) {
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">{COPY.timezone}</p>
      {stats.windows.map((window) => (
        <WindowCards key={window.key} window={window} days={stats.days} revenue={revenue} />
      ))}
      <TrendChart trend={stats.trend} days={stats.days} />
      <RevenueTrend trend={revenue.trend} days={revenue.days} />
    </div>
  )
}
