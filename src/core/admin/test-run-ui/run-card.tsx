'use client'

import { Download, ImageUp, LoaderCircle, Pencil } from 'lucide-react'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { cn } from '@/core/ui/cn'

import type { TestRunView } from '../test-runs'
import { TEST_RUN_COPY as COPY } from './copy'
import { runFailure, usd } from './messages'

export type RunActions = {
  selected: ReadonlySet<string>
  onSelect: (run: TestRunView, on: boolean) => void
  onEdit: (run: TestRunView) => void
  onCover: (run: TestRunView) => void
}

function Meta({ run }: { run: TestRunView }) {
  const parts = [
    run.model,
    run.kind === 'generate' && run.status === 'succeeded' ? COPY.run.styleRefs(run.styleRefCount) : null,
    run.durationMs === null ? null : COPY.run.seconds(run.durationMs),
    run.status === 'running' ? null : run.costUsd === null ? COPY.run.noCost : usd.format(run.costUsd),
  ].filter(Boolean)
  return <p className="text-muted-foreground break-all font-mono text-[11px] tabular-nums">{parts.join(' · ') || ' '}</p>
}

function Picture({ run }: { run: TestRunView }) {
  if (run.status === 'running') {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-2 text-center text-xs">
        <LoaderCircle className="animate-spin" aria-hidden />
        {COPY.run.running}
      </div>
    )
  }
  if (run.status === 'failed' || !run.outputUrl) {
    return <p className="text-destructive flex h-full items-center justify-center p-2 text-center text-xs">{COPY.run.failed(runFailure(run))}</p>
  }
  return (
    <a href={run.outputUrl} target="_blank" rel="noreferrer" className="block h-full" title={COPY.run.open}>
      {/* Admin-only signed URL of a private result; next/image cannot fetch it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={run.outputUrl} alt={COPY.run.open} className="h-full w-full object-contain" loading="lazy" />
    </a>
  )
}

// One test result: the picture (opens full size), how long and what it cost, and what can be
// done with it: select (compare / edit several), edit, set as the cover.
export function RunCard({ run, actions }: { run: TestRunView; actions: RunActions }) {
  const done = run.status === 'succeeded' && run.outputUrl !== null
  const selected = actions.selected.has(run.id)
  return (
    <article className={cn('bg-card grid min-w-0 content-start gap-1.5 rounded-md border p-1.5', selected && 'ring-primary ring-2')}>
      <div className="bg-muted relative aspect-[4/5] overflow-hidden rounded">
        <Picture run={run} />
        {run.isCover ? <Badge className="absolute top-1 left-1">{COPY.run.isCover}</Badge> : null}
      </div>
      <Meta run={run} />
      {done ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button asChild variant="outline" size="icon-sm">
            <a href={`/api/admin/template-download?runId=${run.id}`} download title={COPY.run.download} aria-label={COPY.run.download}><Download /></a>
          </Button>
          <label className="hover:bg-accent flex size-8 items-center justify-center rounded-md" title={COPY.run.select}>
            <Checkbox checked={selected} onCheckedChange={(checked) => actions.onSelect(run, checked === true)} aria-label={COPY.run.select} />
          </label>
          <Button variant="ghost" size="icon-sm" onClick={() => actions.onEdit(run)} title={COPY.run.edit} aria-label={COPY.run.edit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => actions.onCover(run)} title={COPY.run.cover} aria-label={COPY.run.cover}>
            <ImageUp />
          </Button>
        </div>
      ) : null}
    </article>
  )
}
