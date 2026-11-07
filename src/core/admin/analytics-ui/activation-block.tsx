import { readActivation } from '../analytics/load'
import { sqlEditorLink } from '../analytics/links'
import { activationQuery, type Activation } from '../analytics/activation'
import type { Range } from '../analytics/range'
import { ANALYTICS_COPY } from './copy'
import { delta, hours, n, pct, pointDelta, type Delta } from './format'
import { BlockFrame, DeltaText, MetricLabel, Unavailable, type Metric } from './parts'

const COPY = ANALYTICS_COPY.activation

function Tile({ id, metric, value, change, note }: { id: string; metric: Metric; value: string; change: Delta; note?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-lg border border-border bg-background/40 p-4">
      <MetricLabel id={id} metric={metric} className="text-sm text-muted-foreground" />
      <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
      <DeltaText delta={change} />
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

// Times: a shorter wait is better, so the arrow is just the change; the 「?」 says what it is.
export function ActivationView({ activation }: { activation: Activation }) {
  const { current: now, previous: before } = activation
  const m = COPY.metrics
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Tile id="act-signups" metric={m.signups} value={n(now.signups)} change={delta(now.signups, before.signups)} />
      <Tile id="act-24h" metric={m.active24h} value={pct(now.active24hRate)} change={pointDelta(now.active24hRate, before.active24hRate)} />
      <Tile id="act-image" metric={m.toImage} value={hours(now.hoursToImage)} change={delta(now.hoursToImage, before.hoursToImage)} />
      <Tile id="act-paid" metric={m.toPaid} value={hours(now.hoursToPaid)} change={delta(now.hoursToPaid, before.hoursToPaid)} />
      <Tile
        id="act-gift"
        metric={m.paidAfterGift}
        value={pct(now.paidAfterGiftRate)}
        change={pointDelta(now.paidAfterGiftRate, before.paidAfterGiftRate)}
        note={COPY.usedGift(n(now.usedGift))}
      />
    </div>
  )
}

export async function ActivationBlock({ range, giftCredits, projectId }: { range: Range; giftCredits: number; projectId: string }) {
  const block = await readActivation(range, giftCredits)
  const links =
    block.status === 'ok' ? [{ href: sqlEditorLink(projectId, activationQuery(block.window, giftCredits)), label: ANALYTICS_COPY.openInPostHog }] : []
  return (
    <BlockFrame title={COPY.title} desc={COPY.desc} links={links}>
      {block.status === 'ok' ? <ActivationView activation={block.data} /> : <Unavailable />}
    </BlockFrame>
  )
}
