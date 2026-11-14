'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Link, useRouter } from '@/core/i18n/navigation'

import { notifyIfHidden } from './browser-notify'
import { merge, newlySettled, onAnnounce, refundKey, statusMap, type Settled, type SettledItem } from './settle-events'
import { useJobs } from './use-jobs'
import { isWatched } from './watched'

const SHOW_MS = 10_000
const NONE: Settled = { ready: [], failed: [] }

// Where the news points: one finished photo opens it, several open Photos.
const hrefOf = (ready: SettledItem[]) => (ready.length === 1 && ready[0] ? `/photos/${ready[0].id}` : '/photos')

// Collects what settled since the last look, minus what a wait screen in front of the user is
// showing (watched.ts); a tab out of view gets everything, and a browser notification.
function useSettledNews(onNews: (news: Settled) => void) {
  const jobs = useJobs()
  const seen = useRef(statusMap(jobs))
  useEffect(() => {
    const news = newlySettled(seen.current, jobs)
    seen.current = statusMap(jobs)
    const inView = document.visibilityState === 'visible'
    const shown = (job: SettledItem) => !(inView && isWatched(job.id))
    const fresh = { ready: news.ready.filter(shown), failed: news.failed.filter(shown) }
    if (fresh.ready.length || fresh.failed.length) onNews(fresh)
  }, [jobs, onNews])
}

// The notice's two lines: what is ready, and what failed with where its credits stand.
function useNewsLines(news: Settled): { ready: string | null; failed: string | null } {
  const t = useTranslations('app.notify')
  const errors = useTranslations('app.errors')
  const gap = useLocale() === 'zh' ? '' : ' '
  const name = (items: SettledItem[]) => items[0]?.templateName ?? ''
  const { ready, failed } = news
  return {
    ready: ready.length ? t('ready', { count: ready.length, name: name(ready) }) : null,
    failed: failed.length ? `${t('failed', { count: failed.length, name: name(failed) })}${gap}${errors(refundKey(failed.map((job) => job.failure)))}` : null,
  }
}

// The app-wide notice when this tab's photos settle (any app page): "ready" with a link, or
// that it failed and where its credits stand (refunded, as the server reported). Repeated news
// within the ten seconds adds to the same notice. role=status: read out, never steals focus.
// Out of view, the browser's own notification says the same (when the user allowed it).
export function SettleToast() {
  const router = useRouter()
  const [news, setNews] = useState<Settled>(NONE)
  const [onNews] = useState(() => (fresh: Settled) => setNews((current) => merge(current, fresh)))
  useSettledNews(onNews)
  useEffect(() => onAnnounce(onNews), [onNews])
  const lines = useNewsLines(news)
  const total = news.ready.length + news.failed.length

  useEffect(() => {
    if (total === 0) return
    const [title = '', body = ''] = [lines.ready, lines.failed].filter((line): line is string => line !== null)
    notifyIfHidden(title, body, () => router.push(hrefOf(news.ready)))
    const hide = setTimeout(() => setNews(NONE), SHOW_MS)
    return () => clearTimeout(hide)
  }, [news, total, lines.ready, lines.failed, router])

  if (total === 0) return null
  return <ToastCard lines={lines} href={news.ready.length ? hrefOf(news.ready) : null} onClose={() => setNews(NONE)} />
}

function ToastCard({ lines, href, onClose }: { lines: { ready: string | null; failed: string | null }; href: string | null; onClose(): void }) {
  const t = useTranslations('app.notify')
  return (
    <div
      role="status"
      className="hairline shadow-sheet fixed top-[calc(var(--sat)+12px)] left-1/2 z-[120] flex w-[min(calc(100vw-2*var(--gutter)),480px)] -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-popover py-3 pr-3 pl-3.5 text-label leading-[1.4] motion-safe:animate-[sv-toast-in_350ms_var(--ease)]"
    >
      <span aria-hidden="true" className={lines.ready ? 'size-2 flex-none rounded-full bg-success' : 'size-2 flex-none rounded-full bg-destructive'} />
      <p className="min-w-0 flex-1">
        {lines.ready ? <b className="block font-medium">{lines.ready}</b> : null}
        {lines.failed ? <span className="block text-muted-foreground">{lines.failed}</span> : null}
      </p>
      {href ? (
        <Link href={href} onClick={onClose} className="press hairline inline-flex min-h-9 flex-none items-center rounded-full bg-wash px-3 text-caption font-semibold">
          {t('view')}
        </Link>
      ) : null}
      <button type="button" onClick={onClose} aria-label={t('close')} className="-my-1.5 -mr-1 grid size-9 flex-none place-items-center rounded-full text-bone-dim hover:bg-wash hover:text-foreground">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </div>
  )
}
