'use client'

import { useLocale } from 'next-intl'
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'

import type { PhotoItem } from '../photo-item'
import type { WorkView } from '../work-view'
import { prefetchWorkView, useWorkView, type ViewState } from './use-work-view'
import { BackToWork, PhoneSteps, type Steps } from './viewer-bits'
import { useViewer, type Viewer } from './viewer-context'
import { ViewerFrame } from './viewer-frame'
import { stepFrom } from './viewer-path'
import { WorkAgain } from './work-again'
import { WorkDetail } from './work-detail'
import { WorkEdit } from './work-edit'

// The Photos viewer (Owner 2026-11-12): the open work over the grid, its edit and Make again
// forms in the same frame. ← / → and a swipe step through the works in the grid's order while
// the work itself shows; Escape closes (the frame), as do Back and the close button.
export function WorkViewer() {
  const viewer = useViewer()
  return viewer ? <ViewerOn viewer={viewer} /> : null
}

function ViewerOn({ viewer }: { viewer: Viewer }) {
  // The last work stays rendered while the frame plays its closing motion.
  const [shown, setShown] = useState<string | null>(null)
  if (viewer.id && viewer.id !== shown) setShown(viewer.id)
  const id = viewer.id ?? shown
  const { state, retry } = useWorkView(id)
  const steps = useSteps(viewer, id)
  if (!id) return null
  const pane = paneOf(viewer, id, state)
  const back = () => viewer.setMode('detail')
  const detail = pane.kind === 'detail'
  return (
    <ViewerFrame
      open={viewer.id !== null}
      onClose={viewer.close}
      title={pane.item?.templateName ?? ''}
      workId={id}
      phoneBar={<PhoneBar detail={detail} steps={steps} onBack={back} />}
      onKeyDown={(event) => detail && stepOnArrow(event, steps)}
    >
      {pane.kind === 'edit' ? (
        <WorkEdit view={pane.view} onBack={back} onDone={viewer.show} />
      ) : pane.kind === 'again' ? (
        <WorkAgain key={id} item={pane.item} onBack={back} />
      ) : (
        <WorkDetail state={state} listed={pane.item} steps={steps} onRetry={retry} />
      )}
    </ViewerFrame>
  )
}

// On phones: the position and steps over the work, Back over its forms.
function PhoneBar({ detail, steps, onBack }: { detail: boolean; steps: Steps; onBack(): void }) {
  return detail ? <PhoneSteps steps={steps} /> : <BackToWork onBack={onBack} />
}

type Pane =
  | { kind: 'detail'; item: PhotoItem | null }
  | { kind: 'edit'; item: PhotoItem; view: WorkView & { edit: NonNullable<WorkView['edit']> } }
  | { kind: 'again'; item: PhotoItem }

// What the viewer shows. Edit needs the work's view (its price, the balance); Make again only
// the work. Until then, and when editing is off, the work itself shows.
function paneOf(viewer: Viewer, id: string, state: ViewState): Pane {
  const listed = viewer.items.find((item) => item.id === id) ?? null
  const item = state.kind === 'ready' ? state.view.item : listed
  if (viewer.mode === 'edit' && state.kind === 'ready' && state.view.edit) return { kind: 'edit', item: state.view.item, view: { ...state.view, edit: state.view.edit } }
  if (viewer.mode === 'again' && item) return { kind: 'again', item }
  return { kind: 'detail', item: listed }
}

// Where the work sits in the grid, and the step to its neighbours, whose views start loading.
function useSteps(viewer: Viewer, id: string | null): Steps {
  const ids = viewer.items.map((item) => item.id)
  const index = id ? ids.indexOf(id) : -1
  const key = ids.join(',')
  const show = viewer.show
  const locale = useLocale()
  useEffect(() => {
    if (!id || index < 0) return
    for (const delta of [-1, 1] as const) {
      const next = stepFrom(key.split(','), id, delta)
      if (next) prefetchWorkView(next, locale)
    }
  }, [id, index, key, locale])
  const go = useCallback(
    (delta: -1 | 1) => {
      const next = id ? stepFrom(key.split(','), id, delta) : null
      if (next) show(next)
    },
    [id, key, show],
  )
  return index < 0 || ids.length < 2 ? null : { index, count: ids.length, go }
}

// Arrow keys, unless a control that uses them has focus (a field, a picker), or the key came
// from a sheet opened on top (the delete confirmation: React events bubble through portals).
function stepOnArrow(event: KeyboardEvent<HTMLDivElement>, steps: Steps) {
  if (!steps || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.altKey || event.metaKey || event.ctrlKey) return
  const target = event.target as HTMLElement
  if (!event.currentTarget.contains(target) || target.closest('input,textarea,select,[contenteditable],[role=radiogroup],[role=slider],[role=tablist]')) return
  event.preventDefault()
  steps.go(event.key === 'ArrowLeft' ? -1 : 1)
}
