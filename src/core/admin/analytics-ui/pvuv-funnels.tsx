import { Suspense } from 'react'

import type { PvuvFunnel, PvuvFunnelStep } from '../analytics/pvuv-read'
import { readPvuvFunnels, type PvuvFunnelReport, type PvuvState } from '../analytics/pvuv-load'
import type { Range } from '../analytics/range'
import { n, pct } from './format'
import { BlockFrame, BlockSkeleton, Empty, MetricLabel } from './parts'
import { PVUV_COPY } from './pvuv-copy'

const COPY = PVUV_COPY.funnels

// One row per step: label, people, the share of the step before, and a bar against the first step.
function StepRows({ id, steps, first }: { id: string; steps: readonly PvuvFunnelStep[]; first: number }) {
  return (
    <ol className="grid gap-3">
      {steps.map((step, i) => {
        const share = first > 0 ? Math.min(1, step.visitors / first) : 0
        return (
          <li key={`${i}-${step.label}`} className="grid gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="min-w-0 font-medium break-words">{step.label}</span>
              <span className="font-mono tabular-nums">
                {n(step.visitors)}
                {step.convPrev === null ? null : <span className="text-xs text-muted-foreground"> {COPY.ofPrev(pct(step.convPrev))}</span>}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share * 100, step.visitors ? 1 : 0)}%` }} />
            </div>
            {step.lowSample ? (
              <MetricLabel id={`pvuv-${id}-low-${i}`} metric={{ label: COPY.lowSample, help: COPY.lowSampleHelp }} className="text-xs text-muted-foreground" />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export function PvuvFunnelSteps({ id, funnel }: { id: string; funnel: PvuvFunnel }) {
  const first = funnel.steps[0]?.visitors ?? 0
  if (funnel.steps.length === 0 || first === 0) return <Empty text={COPY.empty} />
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {[funnel.entered === null ? null : COPY.entered(n(funnel.entered)), funnel.cleanOnly ? COPY.cleanOnly : null].filter(Boolean).join(' · ')}
      </p>
      <StepRows id={id} steps={funnel.steps} first={first} />
      {funnel.sideSteps.length ? (
        <div className="grid gap-2 border-t border-border pt-4">
          <p className="text-sm">
            <span className="font-semibold">{COPY.sideTitle}</span>
            <span className="text-muted-foreground"> · {COPY.sideHelp}</span>
          </p>
          <StepRows id={`${id}-side`} steps={funnel.sideSteps} first={first} />
        </div>
      ) : null}
    </div>
  )
}

function Notice({ text }: { text: string }) {
  return (
    <p role="status" className="rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  )
}

// The whole 「漏斗」 view from data already read (also what the tests render).
export function PvuvFunnelsPanel({ state }: { state: PvuvState<PvuvFunnelReport[]> }) {
  const links = [{ href: PVUV_COPY.href, label: PVUV_COPY.open }]
  if (state.status !== 'ok' || state.data.length === 0) {
    const text = state.status === 'unconfigured' ? PVUV_COPY.unconfigured : state.status === 'failed' ? PVUV_COPY.failed : COPY.none
    return (
      <BlockFrame title={COPY.title} desc={COPY.desc} links={links}>
        <Notice text={text} />
      </BlockFrame>
    )
  }
  return (
    <div className="grid min-w-0 gap-6">
      <p className="text-sm text-muted-foreground">
        {COPY.desc} {PVUV_COPY.note}
      </p>
      {state.data.map((report, i) => (
        <BlockFrame key={report.id} title={report.name} desc={COPY.funnelId(report.id)} links={i === 0 ? links : []}>
          {report.funnel.status === 'ok' ? (
            <PvuvFunnelSteps id={`f${i}`} funnel={report.funnel.data} />
          ) : (
            <Notice text={report.funnel.status === 'unconfigured' ? PVUV_COPY.unconfigured : COPY.funnelFailed} />
          )}
        </BlockFrame>
      ))}
    </div>
  )
}

async function PvuvFunnelsLoaded({ range }: { range: Range }) {
  return <PvuvFunnelsPanel state={await readPvuvFunnels(range)} />
}

// 「漏斗」 while PostHog is off: PVUV's saved funnels for the page's range.
export function PvuvFunnelsView({ range }: { range: Range }) {
  return (
    <Suspense key={range} fallback={<BlockSkeleton title={COPY.title} />}>
      <PvuvFunnelsLoaded range={range} />
    </Suspense>
  )
}
