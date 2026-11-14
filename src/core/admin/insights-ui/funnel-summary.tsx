import { DASH, n, pct } from '../analytics-ui/format'
import { MetricLabel } from '../analytics-ui/parts'
import { Section } from '../growth-ui/section'
import type { Counts } from '../insights/funnel'
import { biggestDrop, stepsOf, type Drop, type Step } from '../insights/steps'
import { INSIGHTS_COPY as COPY } from './copy'

const label = (key: Step['key']) => COPY.funnel.steps[key].label

function DropLine({ drop, signups }: { drop: Drop | null; signups: number }) {
  const text = signups === 0 ? COPY.funnel.noSignups : drop ? COPY.funnel.drop(label(drop.from), label(drop.to), pct(drop.conversion), n(drop.lost)) : COPY.funnel.noDrop
  return (
    <p role="status" className={drop ? 'rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive' : 'text-sm text-muted-foreground'}>
      {text}
    </p>
  )
}

function StepCard({ step, worst }: { step: Step; worst: boolean }) {
  return (
    <li className={`grid content-start gap-1 rounded-md border p-3 ${worst ? 'border-destructive' : 'border-border'}`}>
      <MetricLabel id={`insights-step-${step.key}`} metric={COPY.funnel.steps[step.key]} className="text-sm text-muted-foreground" />
      <span className="text-2xl font-semibold tabular-nums">{step.count === null ? DASH : n(step.count)}</span>
      {step.key !== 'visitors' ? (
        <span className={`text-sm tabular-nums ${worst ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
          {COPY.funnel.conversion} {pct(step.conversion)}
        </span>
      ) : null}
    </li>
  )
}

// The whole period: four steps, each with its conversion from the step before; the step with the
// lowest conversion is outlined and spelled out underneath.
export function FunnelSummary({ counts, notes }: { counts: Counts; notes: string[] }) {
  const steps = stepsOf(counts)
  const drop = biggestDrop(steps)
  return (
    <Section title={COPY.funnel.title} desc={COPY.funnel.desc}>
      <ol className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={COPY.funnel.title}>
        {steps.map((step) => (
          <StepCard key={step.key} step={step} worst={drop?.to === step.key} />
        ))}
      </ol>
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <MetricLabel id="insights-imaged24h" metric={COPY.funnel.imaged24h} className="text-muted-foreground" />
        <span className="font-semibold tabular-nums">{n(counts.imaged24h)}</span>
      </div>
      <DropLine drop={drop} signups={counts.signups} />
      {notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
    </Section>
  )
}
