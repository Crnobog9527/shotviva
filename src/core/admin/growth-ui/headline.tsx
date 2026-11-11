import type { Range } from '../analytics/range'
import { delta, n, type Delta } from '../analytics-ui/format'
import { biggestDrop, newUserSteps } from '../growth/funnel'
import type { People } from '../growth/people'
import type { GrowthStats } from '../growth/stats'
import { usd } from '../orders/money'
import { GROWTH_COPY as COPY } from './copy'

type Props = { range: Range; db: GrowthStats; people: People | null }

// The sentence the Owner reads first, the four numbers against the previous period, and the one
// step where new users stopped most.
export function Headline({ range, db, people }: Props) {
  const cur = db.periods.current
  const prev = db.periods.previous
  const chain = COPY.headline.chain({
    period: COPY.period[range],
    visitors: people ? n(people.current.visitors) : null,
    signups: n(cur.signups),
    images: n(cur.new_users.first_image),
    paid: n(cur.new_users.paid),
  })
  const trends = [
    { key: 'visitors', label: COPY.trend.visitors, value: people ? n(people.current.visitors) : '—', delta: people ? delta(people.current.visitors, people.previous.visitors) : null },
    { key: 'signups', label: COPY.trend.signups, value: n(cur.signups), delta: delta(cur.signups, prev.signups) },
    { key: 'payers', label: COPY.trend.payers, value: n(cur.payers), delta: delta(cur.payers, prev.payers) },
    { key: 'net', label: COPY.trend.net, value: usd.format(cur.money.net_usd), delta: delta(cur.money.net_usd, prev.money.net_usd) },
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
              <dt className="text-sm text-muted-foreground">{trend.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-lg font-semibold tabular-nums">{trend.value}</span>
                <TrendWord delta={trend.delta} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function TrendWord({ delta: value }: { delta: Delta }) {
  if (!value) return <span className="text-xs text-muted-foreground">{COPY.trend.none}</span>
  const word = COPY.trend[value.direction]
  const tone = value.direction === 'up' ? 'text-success' : value.direction === 'down' ? 'text-destructive' : 'text-muted-foreground'
  return (
    <span className={`text-sm tabular-nums ${tone}`}>
      {word} {value.text.replace(/^[+−]/, '')}
    </span>
  )
}

function Insight({ db, people }: { db: GrowthStats; people: People | null }) {
  const cur = db.periods.current
  if (cur.signups === 0) return <p className="text-base">{COPY.insight.noSignups}</p>
  const drop = biggestDrop(newUserSteps(cur, people?.current ?? null))
  if (!drop) return <p className="text-base">{COPY.insight.noDrop}</p>
  const steps = COPY.funnel.steps
  return <p className="text-base">{COPY.insight.drop(steps[drop.from].label, steps[drop.to].label, n(drop.lost))}</p>
}
