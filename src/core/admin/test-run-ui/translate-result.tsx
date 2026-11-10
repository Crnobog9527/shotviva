'use client'

import { LoaderCircle } from 'lucide-react'

import { Button } from '@/core/ui/button'

import type { TestRunView } from '../test-runs'
import { TestThumbnail } from './test-thumbnail'
import { TEST_RUN_COPY as COPY } from './copy'
import { runFailure, usd } from './messages'

export type TranslateState =
  | { status: 'running' }
  | { status: 'done'; run: TestRunView; coverSet: boolean; saving?: boolean }

type Props = { label: string; state: TranslateState; onRerun: () => void; onSetCover: () => void }

function Picture({ label, state }: { label: string; state: TranslateState }) {
  if (state.status === 'running') {
    return (
      <span className="text-muted-foreground flex flex-col items-center gap-2 text-xs">
        <LoaderCircle className="animate-spin" aria-hidden />
        {COPY.run.running}
      </span>
    )
  }
  const { run } = state
  if (run.status !== 'succeeded' || !run.outputUrl) return <p className="text-destructive p-2 text-center text-xs">{COPY.run.failed(runFailure(run))}</p>
  return (
    <a href={run.outputUrl} target="_blank" rel="noreferrer" className="h-full w-full">
      <TestThumbnail kind="run" id={run.id} src={run.thumbnailUrl ?? run.outputUrl} originalUrl={run.outputUrl} alt={label} className="h-full w-full object-contain" />
    </a>
  )
}

// One target language's translation in the dialog: running, the result (or why it failed), its
// cost, and 重跑 / 设为该语言封面.
export function TranslateResult({ label, state, onRerun, onSetCover }: Props) {
  const done = state.status === 'done' ? state : null
  const settable = done?.run.status === 'succeeded' && done.run.outputUrl !== null
  return (
    <li className="bg-card grid content-start gap-2 rounded-md border p-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="bg-muted flex aspect-[4/5] items-center justify-center overflow-hidden rounded">
        <Picture label={label} state={state} />
      </div>
      {done ? (
        <>
          <p className="text-muted-foreground font-mono text-[11px]">{done.run.costUsd === null ? COPY.run.noCost : usd.format(done.run.costUsd)}</p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={onRerun}>
              {COPY.translate.rerun}
            </Button>
            {settable ? (
              <Button size="sm" onClick={onSetCover} disabled={done.coverSet || done.saving}>
                {done.coverSet ? COPY.translate.done(label) : COPY.translate.setAs(label)}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </li>
  )
}
