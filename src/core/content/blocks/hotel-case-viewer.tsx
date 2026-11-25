'use client'

import { ChevronLeft, ChevronRight, XIcon } from 'lucide-react'
import { useLocale } from 'next-intl'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

import { installScrollLockKeeper } from '@/core/ui/scroll-lock-keeper'
import { SiteImage as Image } from '@/core/ui/site-image'

import { caseNote, pictureStatus, type CaseNote, type PictureStatus } from './hotel-case-state'
import { readCases, readTags, shownCase, thumbOf, type Thumb, type ViewerTags, type ViewerText } from './hotel-cases-dom'
import './hotel-case-viewer.css'

// Half the viewer from 768 (the two pictures side by side, the viewer at most 1200 wide), the
// whole width below it, where they stack.
const FULL_SIZES = '(min-width: 1200px) 580px, (min-width: 768px) 48vw, 100vw'

// The viewer's own words live here (`failed` ends where the retry button follows: a space in English, none in Chinese), in its lazily loaded chunk, not in every home page's HTML.
export const LABELS = {
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

export type Picture = { src: string; alt: string }
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

// The list's thumbnail as it is (same srcset, sizes and AVIF source, so the same small file).
function ThumbPicture({ thumb }: { thumb: Thumb }) {
  /* eslint-disable @next/next/no-img-element -- the list thumbnail's own, already sized addresses */
  const img = <img className="hc-thumb" src={thumb.src} srcSet={thumb.srcSet || undefined} sizes={thumb.sizes || undefined} alt="" />
  /* eslint-enable @next/next/no-img-element */
  if (!thumb.avif) return img
  return (
    <picture style={{ display: 'contents' }}>
      <source type="image/avif" srcSet={thumb.avif.srcSet} sizes={thumb.avif.sizes} style={{ display: 'none' }} />
      {img}
    </picture>
  )
}

// One side of the case: the list's thumbnail at once, softened, on a plate that pulses while the
// full-size picture is on its way; that picture over it, shown once it has loaded (onLoad, or
// already complete when it mounts). If it fails to load, the thumbnail stays and the case's note
// offers a retry, which mounts the picture again (`attempt` in its key).
export function Full(props: {
  picture: Picture | undefined
  thumb: Thumb | null
  tag: string
  ai?: boolean
  status: PictureStatus
  attempt: number
  onShown: (src: string) => void
  onBroken: (src: string) => void
}) {
  const { picture, thumb, tag, ai, status, attempt, onShown, onBroken } = props
  return (
    <figure className={status === 'waiting' ? 'hc-full hc-wait' : 'hc-full'}>
      {thumb ? <ThumbPicture key={thumb.src} thumb={thumb} /> : null}
      {picture ? (
        <Image
          key={`${picture.src}#${attempt}`}
          className={status === 'shown' ? 'hc-big hc-on' : 'hc-big'}
          src={picture.src}
          alt={picture.alt}
          width={1600}
          height={900}
          sizes={FULL_SIZES}
          onLoad={() => onShown(picture.src)}
          onError={() => onBroken(picture.src)}
          ref={(node: HTMLImageElement | null) => {
            if (node?.complete && node.naturalWidth > 0) onShown(picture.src)
          }}
        />
      ) : null}
      <span className={ai ? 'hc-tag hc-ai' : 'hc-tag'} aria-hidden>
        {tag}
      </span>
    </figure>
  )
}

export type Labels = (typeof LABELS)[keyof typeof LABELS]

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

// Under the pictures while they are not both the full-size ones: loading, or failed with a retry.
export function PictureNote({ note, labels, retry }: { note: CaseNote; labels: Labels; retry: () => void }) {
  if (note === 'loading') {
    return (
      <p className="hc-note" role="status">
        {labels.loading}
      </p>
    )
  }
  if (note !== 'failed') return null
  return (
    <p className="hc-note" role="status">
      {labels.failed}
      <button type="button" className="hc-retry" onClick={retry}>
        {labels.retry}
      </button>
    </p>
  )
}

// Full-size pictures that have loaded, and those that failed to (until a retry clears them and
// bumps `attempt`, which mounts every picture of the viewer again).
const add = (src: string) => (now: ReadonlySet<string>) => (now.has(src) ? now : new Set(now).add(src))
function usePictureLoads() {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set())
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  const [attempt, setAttempt] = useState(0)
  return {
    shown,
    broken,
    attempt,
    onShown: (src: string) => setShown(add(src)),
    onBroken: (src: string) => setBroken(add(src)),
    reload: () => {
      setBroken(new Set())
      setAttempt((n) => n + 1)
    },
  }
}

type CaseProps = {
  item: ViewerText
  at: number
  total: number
  pair: Pair | undefined
  failed: boolean
  retry: () => void
  tags: ViewerTags
  labels: Labels
  step: (by: number) => void
}

// One case in the viewer: name and counter, the two pictures, the loading or retry note, the line
// and previous / next.
function CaseView({ item, at, total, pair, failed, retry, tags, labels, step }: CaseProps) {
  const loads = usePictureLoads()
  const seen = { requestFailed: failed, shown: loads.shown, broken: loads.broken }
  const before = pictureStatus(pair?.before.src, seen)
  const after = pictureStatus(pair?.after.src, seen)
  const side = { attempt: loads.attempt, onShown: loads.onShown, onBroken: loads.onBroken }
  const again = () => {
    loads.reload()
    retry()
  }
  return (
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
        <Full picture={pair?.before} thumb={thumbOf(document, at, 0)} tag={tags.before} status={before} {...side} />
        <Full picture={pair?.after} thumb={thumbOf(document, at, 1)} tag={tags.after} status={after} {...side} ai />
      </div>
      <PictureNote note={caseNote([before, after])} labels={labels} retry={again} />
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
  )
}

// The hotels viewer (Owner 2026-11-25): one case at a time, the phone photo large on the left and
// the result large on the right (stacked on a phone), its name and line, previous / next through
// the four cases (buttons, and the arrow keys), and a close button. Radix gives the modal parts:
// focus held inside, Esc closes, the page behind inert and still. On close, focus goes back to the
// case being shown, or to the button that opened the viewer when that case is not on screen.
// Each side shows the list's thumbnail at once and the full-size picture once it has loaded.
export function HotelCaseViewer({ index, onIndex, opener }: Props) {
  const locale = useLocale() === 'zh' ? 'zh' : 'en'
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
          {item ? <CaseView item={item} at={at} total={total} pair={pairs?.[at]} failed={failed} retry={retry} tags={tags} labels={LABELS[locale]} step={step} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
