'use client'

import { useTranslations } from 'next-intl'
import { useState, type SyntheticEvent } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { thumbUrlFor } from '@/core/jobs/job-view'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { ThumbImg } from '@/core/ui/thumb-img'

import { DetailHead } from '../../detail/detail-head'
import { EditTrigger } from '../../edit-ui/edit-trigger'
import { SIDE_BY_SIDE } from '../../result/action-styles'
import { DeleteWork } from '../../result/delete-work'
import { AgainIcon, ResultView } from '../../result/result-view'
import type { PhotoItem } from '../photo-item'
import type { WorkView } from '../work-view'
import { useSwipe } from './use-swipe'
import type { ViewState } from './use-work-view'
import { BatchLine, TraySteps, ViewerMessage, type Steps } from './viewer-bits'
import { useViewer, type Viewer } from './viewer-context'
import { VIEWER_GRID, VIEWER_SIDE, VIEWER_TRAY } from './viewer-frame'

type Props = { state: ViewState; listed: PhotoItem | null; steps: Steps; onRetry(): void }

// The work itself (the photo page as it was, T6 photo.html), in the viewer: the photo in the
// tray, then name, Download / Share, Edit and Make again (both switching the viewer in place),
// Delete, the batch, what an edit came from, the note and the facts. The grid's small copy (in
// the browser's cache already) shows at once, with the name; the full file only ever loads here,
// and takes the small copy's place once it has loaded. Until the view arrives the actions are
// quiet placeholders.
export function WorkDetail({ state, listed, steps, onRetry }: Props) {
  const viewer = useViewer()
  const swipe = useSwipe((delta) => steps?.go(delta))
  if (!viewer) return null
  if (state.kind === 'missing' || state.kind === 'error') return <ViewerMessage kind={state.kind} onClose={viewer.close} onRetry={onRetry} />
  return (
    <div className={cn(VIEWER_GRID, 'touch-pan-y')} {...swipe}>
      {state.kind === 'ready' ? <ReadyDetail view={state.view} listed={listed} steps={steps} viewer={viewer} /> : listed ? <Placeholder item={listed} steps={steps} /> : <Skeleton />}
    </div>
  )
}

function ReadyDetail({ view, listed, steps, viewer }: { view: WorkView; listed: PhotoItem | null; steps: Steps; viewer: Viewer }) {
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const full = loadedFor === view.item.id
  // load does not bubble; the capture phase sees the result photo (in the figure) arrive.
  const onLoad = (event: SyntheticEvent) => {
    if ((event.target as HTMLElement).parentElement?.tagName === 'FIGURE') setLoadedFor(view.item.id)
  }
  return (
    <div className="contents" onLoadCapture={onLoad}>
      <ResultView
        item={view.item}
        detail={view.detail}
        shareText={view.shareText}
        edit={view.edit ? <EditTrigger onOpen={() => viewer.setMode('edit')} /> : null}
        parent={view.parent}
        parentDeleted={view.parentDeleted}
        change={view.change}
        remove={<DeleteWork action={() => viewer.actions.deleteWork(view.item.id)} />}
        viewer={{
          tray: cn(VIEWER_TRAY, !full && '[&>figure]:hidden'),
          side: VIEWER_SIDE,
          photoExtra: (
            <>
              {full ? null : <SmallCopy item={listed ?? view.item} />}
              <TraySteps steps={steps} />
            </>
          ),
          again: view.againable ? <AgainButton onOpen={() => viewer.setMode('again')} /> : null,
          batch: <BatchLine item={view.item} items={viewer.items} />,
        }}
      />
    </div>
  )
}

function AgainButton({ onOpen }: { onOpen(): void }) {
  const t = useTranslations('app.result')
  return (
    <button type="button" onClick={onOpen} className={buttonVariants({ variant: 'glass', size: 'touch', className: SIDE_BY_SIDE })}>
      <AgainIcon />
      {t('makeAgain')}
    </button>
  )
}

// A work the grid does not list (an older one, opened by its address): quiet shapes until it loads.
function Skeleton() {
  return (
    <>
      <div className={VIEWER_TRAY} aria-hidden="true">
        <span className="mx-auto block aspect-[4/5] w-full max-w-[420px] animate-pulse rounded-panel bg-wash motion-reduce:animate-none md:max-h-full" />
      </div>
      <div className={VIEWER_SIDE} aria-busy="true">
        <span className="block h-9 w-3/4 rounded-control bg-wash" />
        <span className="mt-2 block h-4 w-1/2 rounded-control bg-wash" />
        <span className="mt-4 block h-14 rounded-control bg-wash" />
      </div>
    </>
  )
}

// The grid's small copy of the work (ARCHITECTURE §8.3「作品小图」), at the size the full photo
// will take: same URL as the grid's tile, so it comes from the browser's cache.
function SmallCopy({ item }: { item: PhotoItem }) {
  const t = useTranslations('app')
  if (!item.thumbUrl) return null
  return (
    <div className="hairline relative mx-auto aspect-[4/5] w-full max-w-[min(100%,calc(62dvh*0.8))] overflow-hidden rounded-panel bg-photo-ground md:h-full md:max-h-[min(calc(100dvh-96px),832px)] md:w-auto md:max-w-full">
      <ThumbImg src={item.thumbUrl} fallback={thumbUrlFor(item.id)} alt={t('workspace.resultAlt', { name: item.templateName })} decoding="async" className={cn(REPLAY_BLOCK_CLASS, 'size-full object-contain')} />
    </div>
  )
}

// The grid's photo and its name, while the rest loads.
function Placeholder({ item, steps }: { item: PhotoItem; steps: Steps }) {
  return (
    <>
      <div className={VIEWER_TRAY}>
        <SmallCopy item={item} />
        <TraySteps steps={steps} />
      </div>
      <div className={VIEWER_SIDE} aria-busy="true">
        <DetailHead item={item} />
        <div className="mt-4 grid gap-2" aria-hidden="true">
          <span className="h-14 animate-pulse rounded-control bg-wash motion-reduce:animate-none" />
          <span className="grid grid-cols-2 gap-2">
            <span className="h-12 rounded-control bg-wash" />
            <span className="h-12 rounded-control bg-wash" />
          </span>
          <span className="h-12 rounded-control bg-wash" />
        </div>
      </div>
    </>
  )
}
