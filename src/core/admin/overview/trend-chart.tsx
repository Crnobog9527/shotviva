import { OVERVIEW_COPY as COPY } from './copy'
import type { DashboardStats } from './stats'

// Plain CSS bars, no chart library: one column per day, total height = jobs, the solid part =
// succeeded. Each bar carries its numbers as a title and an accessible label.
export function TrendChart({ trend, days }: { trend: DashboardStats['trend']; days: number }) {
  const max = Math.max(1, ...trend.map((day) => day.jobs))
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold">{COPY.trend.title(days)}</h2>
        <p className="text-xs text-muted-foreground">{COPY.trend.legend}</p>
      </div>
      <ol className="flex h-40 items-end gap-0.5" aria-label={COPY.trend.title(days)}>
        {trend.map((day) => {
          const label = COPY.trend.day(day.day, day.jobs, day.succeeded)
          return (
            <li key={day.day} className="flex h-full flex-1 flex-col justify-end" title={label} aria-label={label}>
              <div className="flex flex-col justify-end rounded-t-sm bg-primary/25" style={{ height: `${(day.jobs / max) * 100}%` }}>
                <div className="rounded-t-sm bg-primary" style={{ height: day.jobs ? `${(day.succeeded / day.jobs) * 100}%` : 0 }} />
              </div>
            </li>
          )
        })}
      </ol>
      <div className="flex justify-between font-mono text-xs text-muted-foreground">
        <span>{trend[0]?.day}</span>
        <span>{trend.at(-1)?.day}</span>
      </div>
      <p className="text-xs text-muted-foreground">{COPY.trend.revenue}</p>
    </section>
  )
}
