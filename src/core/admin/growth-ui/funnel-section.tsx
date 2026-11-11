import { MetricLabel } from '../analytics-ui/parts'
import { n, pct } from '../analytics-ui/format'
import { rate } from '../analytics/values'
import { newUserSteps, type StepCount } from '../growth/funnel'
import type { GrowthPeriod } from '../growth/stats'
import { GROWTH_COPY as COPY } from './copy'
import { missingText, peopleData, Unverified, type PeopleState } from './people-state'
import { Section } from './section'

type Props = { db: GrowthPeriod; state: PeopleState }

const POSTHOG_STEPS = new Set(['upload', 'paywall', 'checkout'])

// Visitors on top, then one row per step for the people who signed up in the period; each bar is
// that step's share of sign-ups. Returning users get two numbers of their own underneath.
export function FunnelSection({ db, state }: Props) {
  const people = peopleData(state)?.current ?? null
  const steps = newUserSteps(db, people)
  const missing = missingText(state)
  return (
    <Section title={COPY.funnel.title} desc={COPY.funnel.desc}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-4">
        <MetricLabel id="growth-visitors" metric={COPY.funnel.visitors} className="text-sm text-muted-foreground" />
        <span className="text-2xl font-semibold tabular-nums">{people ? n(people.visitors) : '—'}</span>
        {people ? <Unverified /> : null}
        {people ? <VisitorRate signups={db.signups} visitors={people.visitors} /> : <span className="text-sm text-muted-foreground">{missing}</span>}
      </div>
      <ol className="grid gap-3" aria-label={COPY.funnel.title}>
        {steps.map((step, i) => (
          <StepRow key={step.key} step={step} before={closestBefore(steps, i)} signups={db.signups} missing={missing} />
        ))}
      </ol>
      <div className="grid gap-2 border-t border-border pt-4">
        <p className="text-sm">
          <span className="font-semibold">{COPY.funnel.returningTitle}</span>
          <span className="text-muted-foreground"> · {COPY.funnel.returningDesc}</span>
        </p>
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          {(['active', 'paid'] as const).map((key) => (
            <div key={key} className="flex items-baseline gap-2">
              <dt>
                <MetricLabel id={`growth-returning-${key}`} metric={COPY.funnel.returning[key]} className="text-sm text-muted-foreground" />
              </dt>
              <dd className="text-lg font-semibold tabular-nums">{n(db.returning[key])}</dd>
            </div>
          ))}
        </dl>
      </div>
      {people && people.botViews > 0 ? <p className="text-sm text-muted-foreground">{COPY.funnel.bots(n(people.botViews))}</p> : null}
    </Section>
  )
}

// Sign-ups ÷ visitors. PostHog can miss visitors (blockers, no consent), so when it saw fewer
// visitors than there were sign-ups the share would be over 100% and is not shown.
function VisitorRate({ signups, visitors }: { signups: number; visitors: number }) {
  if (signups > visitors) return <span className="text-sm text-muted-foreground">{COPY.funnel.visitorRateHidden}</span>
  return (
    <MetricLabel
      id="growth-visitor-rate"
      metric={{ label: COPY.funnel.visitorRate(pct(rate(signups, visitors))), help: COPY.funnel.visitorRateHelp }}
      className="text-sm text-muted-foreground"
    />
  )
}

function closestBefore(steps: readonly StepCount[], index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    const count = steps[i]?.count
    if (count !== null && count !== undefined) return count
  }
  return null
}

// How many fewer people reached this step than the closest earlier step with a number.
function lostSince(count: number | null, before: number | null): number {
  return count !== null && before !== null && before > count ? before - count : 0
}

function StepLabel({ step }: { step: StepCount }) {
  return (
    <span className="flex items-center gap-1.5">
      <MetricLabel id={`growth-step-${step.key}`} metric={COPY.funnel.steps[step.key]} className="text-sm" />
      {step.count !== null && POSTHOG_STEPS.has(step.key) ? <Unverified /> : null}
    </span>
  )
}

function StepRow({ step, before, signups, missing }: { step: StepCount; before: number | null; signups: number; missing: string }) {
  const share = step.count === null ? null : rate(step.count, signups)
  const lost = lostSince(step.count, before)
  const showShare = step.key !== 'signup' && share !== null
  const notes = [showShare ? `${COPY.funnel.ofSignups} ${pct(share)}` : null, lost ? COPY.funnel.lost(n(lost)) : null].filter(Boolean)
  return (
    <li className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <StepLabel step={step} />
        <span className="text-lg font-semibold tabular-nums">{step.count === null ? '—' : n(step.count)}</span>
      </div>
      {step.count === null ? (
        <p className="text-xs text-muted-foreground">{missing}</p>
      ) : (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (share ?? 0) * 100)}%` }} />
          </div>
          {notes.length ? <p className="text-xs text-muted-foreground tabular-nums">{notes.join(' · ')}</p> : null}
        </>
      )}
    </li>
  )
}
