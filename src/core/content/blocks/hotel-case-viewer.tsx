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

// The viewer's own words live here (`failed` ends where the retry button follows: a space in English, none in Chinese), in its lazily loaded chunk, not in every home page's HTML.
const LABELS = {
  en: {
    close: 'Close',
    previous: 'Previous',
    next: 'Next',
    counter: (n: number, total: number) => `${n} of ${total}`,
    loading: 'Loading the full-size pictures…',
    failed: 'The full-size pictures did not load. ',
    retry: 'Try again',
  },
  zh: {
    close: '关闭',
    previous: '上一组',
    next: '下一组',
    counter: (n: number, total: number) => `第 ${n} 组，共 ${total} 组`,
    loading: '正在加载大图…',
    failed: '大图没有加载出来。',
    retry: '重试',
  },
} as const

type Picture = { src: string; alt: string }
type Pair = { before: Picture; after: Picture }

// The full-size pairs (/api/home/hotels), asked for once per page on the first open. A failed
// request is asked again on the next open; meanwhile each case shows its thumbnails.
let request: Promise<Pair[]> | null = null
function fullPairs(locale: string): Promise<Pair[]> {
  request ??= fetch(`/api/home/hotels?locale=${encodeURIComponent(locale)}`, {
    credentials: 'omit',
  })
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

// One side of the case: the full-size picture once it has arrived; until then (or if it never
// does) the list's thumbnail as it is, softened, on a plate that pulses while the request runs.
function Full({ picture, thumb, tag, ai, loading }: { picture: Picture | undefined; thumb: string; tag: string; ai?: boolean; loading: boolean }) {
  return (
    <figure className={loading ? 'hc-full hc-wait' : 'hc-full'}>
      {/* keyed by address: a new case starts from its own picture, not the last case's */}
      {picture ? (
        <Image key={picture.src} src={picture.src} alt={picture.alt} width={1600} height={900} sizes={FULL_SIZES} />
      ) : thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- the thumbnail's own, already sized address
        <img key={thumb} className="hc-thumb" src={thumb} alt="" />
      ) : null}
      <span className={ai ? 'hc-tag hc-ai' : 'hc-tag'} aria-hidden>
        {tag}
      </span>
    </figure>
  )
}

type Labels = (typeof LABELS)[keyof typeof LABELS]

// The full-size pairs for an open viewer: null until they arrive; `failed` once a request fails,
// until "Try again" (retry) asks once more.
function useFullPairs(opened: boolean, locale: string) {
  const [pairs, setPairs] = useState<Pair[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!opened || pairs) return
    let live = true
    fullPairs(locale).then(
      (answer) => live && setPairs(answer),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [opened, locale, pairs, attempt])
  const retry = () => {
    setFailed(false)
    setAttempt((n) => n + 1)
  }
  return { pairs, failed, retry }
}

// Under the pictures while they are not the full-size ones: loading, or failed with a retry.
function PictureNote({ loading, failed, labels, retry }: { loading: boolean; failed: boolean; labels: Labels; retry: () => void }) {
  if (loading) {
    return (
      <p className="hc-note" role="status">
        {labels.loading}
      </p>
    )
  }
  if (!failed) return null
  return (
    <p className="hc-note" role="status">
      {labels.failed}
      <button type="button" className="hc-retry" onClick={retry}>
        {labels.retry}
      </button>
    </p>
  )
}

// The hotels viewer (Owner 2026-11-25): one case at a time, the phone photo large on the left and
// the result large on the right (stacked on a phone), its name and line, previous / next through
// the four cases (buttons, and the arrow keys), and a close button. Radix gives the modal parts:
// focus held inside, Esc closes, the page behind inert and still. On close, focus goes back to the
// case being shown, or to the button that opened the viewer when that case is not on screen.
// Until the full-size pictures arrive, each side shows the list's thumbnail on a pulsing plate.
export function HotelCaseViewer({ index, onIndex, opener }: Props) {
  const locale = useLocale() === 'zh' ? 'zh' : 'en'
  const labels = LABELS[locale]
  // Rendered in the browser only (ssr: false), after the list is in the page.
  const [cases] = useState<ViewerText[]>(() => readCases(document))
  const [tags] = useState<ViewerTags>(() => readTags(document))
  const { pairs, failed, retry } = useFullPairs(index !== null, locale)
  const shown = useRef<number | null>(index)
  useEffect(() => {
    if (index !== null) shown.current = index
  }, [index])
  useEffect(installScrollLockKeeper, [])

  const total = cases.length
  const at = index ?? 0
  const item = index !== null ? cases[index] : undefined
  const pair = pairs?.[at]
  const loading = !pair && !failed
  const step = (by: number) => {
    if (total > 0) onIndex((at + by + total) % total)
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
                  {labels.counter(at + 1, total)}
                </p>
                <Dialog.Close className="hc-close" aria-label={labels.close}>
                  <XIcon aria-hidden />
                </Dialog.Close>
              </header>
              <div className="hc-fulls">
                <Full picture={pair?.before} thumb={thumbSrc(document, at, 0)} tag={tags.before} loading={loading} />
                <Full picture={pair?.after} thumb={thumbSrc(document, at, 1)} tag={tags.after} loading={loading} ai />
              </div>
              {pair ? null : <PictureNote loading={loading} failed={failed} labels={labels} retry={retry} />}
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
