import type { Range } from '../analytics/range'
import { delta, n } from '../analytics-ui/format'
import { biggestDrop, newUserSteps } from '../growth/funnel'
import type { GrowthStats } from '../growth/stats'
import { usd } from '../orders/money'
import { GROWTH_COPY as COPY } from './copy'
import { peopleData, Unverified, type PeopleState } from './people-state'

type Props = { range: Range; db: GrowthStats; people: PeopleState }
type Trend = { key: string; label: string; current: number | null; previous: number | null; format: (value: number) => string; posthog?: boolean }

// The sentence the Owner reads first, the four numbers against the previous period, and the one
// step where new users stopped most.
export function Headline({ range, db, people }: Props) {
  const cur = db.periods.current
  const prev = db.periods.previous
  const seen = peopleData(people)
  const chain = COPY.headline.chain({
    period: COPY.period[range],
    visitors: seen ? n(seen.current.visitors) : null,
    signups: n(cur.signups),
    images: n(cur.new_users.first_image),
    paid: n(cur.new_users.paid),
  })
  const money = (value: number) => usd.format(value)
  const trends: Trend[] = [
    { key: 'visitors', label: COPY.trend.visitors, current: seen?.current.visitors ?? null, previous: seen?.previous.visitors ?? null, format: n, posthog: true },
    { key: 'signups', label: COPY.trend.signups, current: cur.signups, previous: prev.signups, format: n },
    { key: 'payers', label: COPY.trend.payers, current: cur.payers, previous: prev.payers, format: n },
    { key: 'net', label: COPY.trend.net, current: cur.money.net_usd, previous: prev.money.net_usd, format: money },
  ]
  return (
    <section aria-labelledby="growth-headline" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="growth-headline" className="text-xl leading-snug font-semibold text-balance md:text-2xl">
          {chain}
        </h2>
        <p className="text-base text-muted-foreground">{COPY.headline.money(n(cur.payers), usd.format(cur.money.net_usd))}</p>
      </div>
      <Insight db={db} people={people} />
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">{COPY.headline.compare(COPY.previous[range])}</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          {trends.map((trend) => (
            <div key={trend.key} className="grid gap-0.5">
              <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {trend.label}
                {trend.posthog && seen ? <Unverified /> : null}
              </dt>
              <dd className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-lg font-semibold tabular-nums">{trend.current === null ? '—' : trend.format(trend.current)}</span>
                <TrendWord trend={trend} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

// Up / down in words. With nothing (or nothing positive) to compare with, the previous amount
// itself: a percentage against $0 or a negative number says nothing.
function TrendWord({ trend }: { trend: Trend }) {
  if (trend.current === null || trend.previous === null) return null
  if (trend.previous <= 0) return <span className="text-xs text-muted-foreground tabular-nums">{COPY.trend.previous(trend.format(trend.previous))}</span>
  const value = delta(trend.current, trend.previous)
  if (!value) return null
  const tone = value.direction === 'up' ? 'text-success' : value.direction === 'down' ? 'text-destructive' : 'text-muted-foreground'
  return (
    <span className={`text-sm tabular-nums ${tone}`}>
      {COPY.trend[value.direction]} {value.text.replace(/^[+−]/, '')}
    </span>
  )
}

function Insight({ db, people }: { db: GrowthStats; people: PeopleState }) {
  const cur = db.periods.current
  if (cur.signups === 0) return <p className="text-base">{COPY.insight.noSignups}</p>
  // Wait for PostHog's steps rather than naming one drop and then another.
  if (people.status === 'loading') return <p className="text-base text-muted-foreground">{COPY.funnel.loading}</p>
  const drop = biggestDrop(newUserSteps(cur, peopleData(people)?.current ?? null))
  if (!drop) return <p className="text-base">{COPY.insight.noDrop}</p>
  const steps = COPY.funnel.steps
  return <p className="text-base">{COPY.insight.drop(steps[drop.from].label, steps[drop.to].label, n(drop.lost))}</p>
}
