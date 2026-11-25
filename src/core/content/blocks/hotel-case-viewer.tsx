'use client'

import { ChevronLeft, ChevronRight, XIcon } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { installScrollLockKeeper } from '@/core/ui/scroll-lock-keeper'
import { SiteImage as Image } from '@/core/ui/site-image'

import type { SpaceViewerLabels } from '../page-content'
import { caseButton, readCases, type ViewerCase, type ViewerPicture } from './hotel-cases-dom'

// Half the viewer from 768 (the two pictures side by side, the viewer at most 1200 wide), the
// whole width below it, where they stack.
const FULL_SIZES = '(min-width: 1200px) 580px, (min-width: 768px) 48vw, 100vw'

type Props = {
  index: number | null
  onIndex: (index: number | null) => void
  labels: { before: string; after: string }
  viewer: SpaceViewerLabels
}

function Full({ picture, tag, ai }: { picture: ViewerPicture; tag: string; ai?: boolean }) {
  return (
    <figure className="hc-full">
      {/* keyed by address: a new case starts from an empty plate, not the last case's picture */}
      <Image key={picture.src} src={picture.src} alt={picture.alt} width={1600} height={900} sizes={FULL_SIZES} />
      <span className={ai ? 'hc-tag hc-tag-ai' : 'hc-tag'} aria-hidden>
        {tag}
      </span>
    </figure>
  )
}

// The hotels viewer (Owner 2026-11-25): one case at a time, the phone photo large on the left and
// the result large on the right (stacked on a phone), its name and line, previous / next through
// the four cases (buttons, and the arrow keys), and a close button. Radix gives the modal parts:
// focus held inside, Esc closes, the page behind inert and still. On close, focus goes back to the
// case being shown, so after browsing the reader is on that case in the list.
export function HotelCaseViewer({ index, onIndex, labels, viewer }: Props) {
  // Rendered in the browser only (ssr: false), after the list is in the page.
  const [cases] = useState<ViewerCase[]>(() => readCases(document.getElementById('hotels') ?? document))
  const shown = useRef<number | null>(index)
  useEffect(() => {
    if (index !== null) shown.current = index
  }, [index])
  useEffect(installScrollLockKeeper, [])

  const total = cases.length
  const item = index !== null ? cases[index] : undefined
  const step = (by: number) => {
    if (index !== null && total > 0) onIndex((index + by + total) % total)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') step(-1)
    else if (event.key === 'ArrowRight') step(1)
    else return
    event.preventDefault()
  }

  return (
    <Dialog.Root open={index !== null && Boolean(item)} onOpenChange={(open) => (open ? undefined : onIndex(null))}>
      <Dialog.Portal>
        <Dialog.Overlay className="hc-overlay" />
        <Dialog.Content
          className="hc-viewer"
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(event) => {
            const button = shown.current === null ? null : caseButton(document, shown.current)
            if (!button) return
            event.preventDefault()
            button.focus({ preventScroll: false })
          }}
        >
          {item ? (
            <>
              <header className="hc-head">
                <Dialog.Title className="hc-name">{item.title}</Dialog.Title>
                <p className="hc-count" aria-live="polite">
                  {viewer.counter.replace('{n}', String((index ?? 0) + 1)).replace('{total}', String(total))}
                </p>
                <Dialog.Close className="hc-close" aria-label={viewer.close}>
                  <XIcon aria-hidden />
                </Dialog.Close>
              </header>
              <div className="hc-fulls">
                <Full picture={item.before} tag={labels.before} />
                <Full picture={item.after} tag={labels.after} ai />
              </div>
              <Dialog.Description className="hc-desc">{item.change}</Dialog.Description>
              <nav className="hc-nav">
                <button type="button" className="hc-step" onClick={() => step(-1)}>
                  <ChevronLeft aria-hidden />
                  {viewer.previous}
                </button>
                <button type="button" className="hc-step" onClick={() => step(1)}>
                  {viewer.next}
                  <ChevronRight aria-hidden />
                </button>
              </nav>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
