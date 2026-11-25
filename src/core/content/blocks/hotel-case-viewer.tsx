'use client'

import { ChevronLeft, ChevronRight, XIcon } from 'lucide-react'
import { useLocale } from 'next-intl'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

import { installScrollLockKeeper } from '@/core/ui/scroll-lock-keeper'
import { SiteImage as Image } from '@/core/ui/site-image'

import { readCases, readTags, shownCase, thumbSrc, type ViewerTags, type ViewerText } from './hotel-cases-dom'
import './hotel-case-viewer.css'

// Half the viewer from 768 (the two pictures side by side, the viewer at most 1200 wide), the
// whole width below it, where they stack.
const FULL_SIZES = '(min-width: 1200px) 580px, (min-width: 768px) 48vw, 100vw'

// The viewer's own words live here, in its lazily loaded chunk, not in every home page's HTML.
const LABELS = {
  en: { close: 'Close', previous: 'Previous', next: 'Next', counter: (n: number, total: number) => `${n} of ${total}` },
  zh: { close: '关闭', previous: '上一组', next: '下一组', counter: (n: number, total: number) => `第 ${n} 组，共 ${total} 组` },
} as const

type Picture = { src: string; alt: string }
type Pair = { before: Picture; after: Picture }

// The full-size pairs (/api/home/hotels), asked for once per page on the first open. A failed
// request is asked again on the next open; meanwhile each case shows its thumbnails.
let request: Promise<Pair[]> | null = null
function fullPairs(locale: string): Promise<Pair[]> {
  request ??= fetch(`/api/home/hotels?locale=${encodeURIComponent(locale)}`, { credentials: 'omit' })
    .then((response) => (response.ok ? (response.json() as Promise<Pair[]>) : Promise.reject(new Error('Hotel pictures unavailable'))))
    .catch((error: unknown) => {
      request = null
      throw error
    })
  return request
}

type Props = {
  index: number | null
  onIndex: (index: number | null) => void
  // The button that opened the viewer: focus goes back to it when the case shown is not on screen.
  opener: RefObject<HTMLElement | null>
}

function Full({ picture, tag, ai }: { picture: Picture | undefined; tag: string; ai?: boolean }) {
  return (
    <figure className="hc-full">
      {/* keyed by address: a new case starts from an empty plate, not the last case's picture */}
      {picture?.src ? <Image key={picture.src} src={picture.src} alt={picture.alt} width={1600} height={900} sizes={FULL_SIZES} /> : null}
      <span className={ai ? 'hc-tag hc-ai' : 'hc-tag'} aria-hidden>
        {tag}
      </span>
    </figure>
  )
}

// The hotels viewer (Owner 2026-11-25): one case at a time, the phone photo large on the left and
// the result large on the right (stacked on a phone), its name and line, previous / next through
// the four cases (buttons, and the arrow keys), and a close button. Radix gives the modal parts:
// focus held inside, Esc closes, the page behind inert and still. On close, focus goes back to the
// case being shown, or to the button that opened the viewer when that case is not on screen.
export function HotelCaseViewer({ index, onIndex, opener }: Props) {
  const locale = useLocale() === 'zh' ? 'zh' : 'en'
  const labels = LABELS[locale]
  // Rendered in the browser only (ssr: false), after the list is in the page.
  const [cases] = useState<ViewerText[]>(() => readCases(document))
  const [tags] = useState<ViewerTags>(() => readTags(document))
  const [pairs, setPairs] = useState<Pair[] | null>(null)
  const shown = useRef<number | null>(index)
  useEffect(() => {
    if (index !== null) shown.current = index
  }, [index])
  useEffect(installScrollLockKeeper, [])
  useEffect(() => {
    if (index === null || pairs) return
    let live = true
    fullPairs(locale).then(
      (answer) => live && setPairs(answer),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [index, locale, pairs])

  const total = cases.length
  const item = index !== null ? cases[index] : undefined
  const pair: Pair | undefined =
    index === null ? undefined : (pairs?.[index] ?? { before: { src: thumbSrc(document, index, 0), alt: '' }, after: { src: thumbSrc(document, index, 1), alt: '' } })
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
    <Dialog.Root open={Boolean(item)} onOpenChange={(open) => (open ? undefined : onIndex(null))}>
      <Dialog.Portal>
        <Dialog.Overlay className="hc-overlay" />
        <Dialog.Content
          className="hc-viewer"
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(event) => {
            const button = (shown.current === null ? null : shownCase(document, shown.current)) ?? opener.current
            if (!button) return
            event.preventDefault()
            button.focus()
          }}
        >
          {item ? (
            <>
              <header className="hc-head">
                <Dialog.Title className="hc-name">{item.title}</Dialog.Title>
                <p className="hc-count" aria-live="polite">
                  {labels.counter((index ?? 0) + 1, total)}
                </p>
                <Dialog.Close className="hc-close" aria-label={labels.close}>
                  <XIcon aria-hidden />
                </Dialog.Close>
              </header>
              <div className="hc-fulls">
                <Full picture={pair?.before} tag={tags.before} />
                <Full picture={pair?.after} tag={tags.after} ai />
              </div>
              <Dialog.Description className="hc-desc">{item.change}</Dialog.Description>
              <nav className="hc-nav">
                <button type="button" className="hc-step" onClick={() => step(-1)}>
                  <ChevronLeft aria-hidden />
                  {labels.previous}
                </button>
                <button type="button" className="hc-step" onClick={() => step(1)}>
                  {labels.next}
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
