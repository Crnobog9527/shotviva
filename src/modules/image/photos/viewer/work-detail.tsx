'use client'

import { useTranslations } from 'next-intl'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { DetailHead } from '../../detail/detail-head'
import { EditTrigger } from '../../edit-ui/edit-trigger'
import { SIDE_BY_SIDE } from '../../result/action-styles'
import { DeleteWork } from '../../result/delete-work'
import { GroundedImg } from '../../result/grounded-img'
import { AgainIcon, ResultView } from '../../result/result-view'
import type { PhotoItem } from '../photo-item'
import { useSwipe } from './use-swipe'
import type { ViewState } from './use-work-view'
import { BatchLine, TraySteps, ViewerMessage, type Steps } from './viewer-bits'
import { useViewer } from './viewer-context'
import { VIEWER_GRID, VIEWER_SIDE, VIEWER_TRAY } from './viewer-frame'

type Props = { state: ViewState; listed: PhotoItem | null; steps: Steps; onRetry(): void }

// The work itself (the photo page as it was, T6 photo.html), in the viewer: the photo in the
// tray, then name, Download / Share, Edit and Make again (both switching the viewer in place),
// Delete, the batch, what an edit came from, the note and the facts. Until its view arrives the
// grid's own photo and name show at once, the actions as quiet placeholders.
export function WorkDetail({ state, listed, steps, onRetry }: Props) {
  const viewer = useViewer()
  const swipe = useSwipe((delta) => steps?.go(delta))
  if (!viewer) return null
  if (state.kind === 'missing' || state.kind === 'error') return <ViewerMessage kind={state.kind} onClose={viewer.close} onRetry={onRetry} />
  const grid = cn(VIEWER_GRID, 'touch-pan-y')
  if (state.kind === 'loading') return <div className={grid} {...swipe}>{listed ? <Placeholder item={listed} steps={steps} /> : null}</div>
  const { view } = state
  return (
    <div className={grid} {...swipe}>
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
          tray: VIEWER_TRAY,
          side: VIEWER_SIDE,
          photoExtra: <TraySteps steps={steps} />,
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

// The grid's photo (already in the browser's cache) and its name, while the rest loads.
function Placeholder({ item, steps }: { item: PhotoItem; steps: Steps }) {
  const t = useTranslations('app')
  return (
    <>
      <div className={VIEWER_TRAY}>
        <figure className="hairline relative mx-auto w-fit max-w-full overflow-hidden rounded-panel bg-photo-ground">
          {item.fileUrl ? (
            <GroundedImg ground="white" src={item.fileUrl} alt={t('workspace.resultAlt', { name: item.templateName })} className={cn(REPLAY_BLOCK_CLASS, 'block h-auto max-h-[62dvh] w-auto max-w-full md:max-h-[min(calc(100dvh-96px),832px)]')} />
          ) : null}
        </figure>
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
