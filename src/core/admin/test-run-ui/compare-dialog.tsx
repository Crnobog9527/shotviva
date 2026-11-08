'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { TestRunView } from '../test-runs'
import { ASPECT_LABEL, RESOLUTION_LABEL, TEST_RUN_COPY as COPY } from './copy'
import { usd } from './messages'

type Props = { pair: readonly [TestRunView, TestRunView] | null; photoUrls: Readonly<Record<string, string>>; onClose: () => void }

function Side({ run, photoUrl }: { run: TestRunView; photoUrl: string | null }) {
  const title = run.kind === 'generate' ? COPY.records.first : COPY.records.editOf(run.instruction ?? '')
  const aspect = run.aspectRatio ? (ASPECT_LABEL[run.aspectRatio] ?? run.aspectRatio) : null
  const facts = [RESOLUTION_LABEL[run.resolution], aspect, run.editScope ? COPY.run.scope(run.editScope) : null, run.costUsd === null ? null : usd.format(run.costUsd)]
  return (
    <figure className="grid min-w-0 content-start gap-2">
      <div className="bg-muted flex aspect-[4/5] items-center justify-center overflow-hidden rounded-md border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {run.outputUrl ? <img src={run.outputUrl} alt={title} className="h-full w-full object-contain" /> : null}
      </div>
      <figcaption className="grid gap-0.5">
        <span className="text-sm font-medium break-words">{title}</span>
        <span className="text-muted-foreground text-xs">{facts.filter(Boolean).join(' · ')}</span>
        {photoUrl ? (
          <a href={photoUrl} target="_blank" rel="noreferrer" className="text-muted-foreground text-xs underline underline-offset-4">
            {COPY.compare.source}
          </a>
        ) : null}
      </figcaption>
    </figure>
  )
}

// 两两对比 (ARCHITECTURE §10.b): two ticked results side by side at the same size.
export function CompareDialog({ pair, photoUrls, onClose }: Props) {
  return (
    <Dialog open={pair !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{COPY.compare.title}</DialogTitle>
        </DialogHeader>
        {pair ? (
          <div className="grid grid-cols-2 gap-4">
            {pair.map((run) => (
              <Side key={run.id} run={run} photoUrl={run.photoId ? (photoUrls[run.photoId] ?? null) : null} />
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
