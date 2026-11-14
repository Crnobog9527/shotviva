'use client'

import { useTranslations } from 'next-intl'
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

// The app-wide notice when this tab's photos settle (any app page): "ready" with a link, or
// that it failed and where its credits stand (refunded, as the server reported). Repeated news
// within the ten seconds adds to the same notice. role=status: read out, never steals focus.
export function SettleToast() {
  const t = useTranslations('app.notify')
  const errors = useTranslations('app.errors')
  const router = useRouter()
  const [news, setNews] = useState<Settled>(NONE)
  const [onNews] = useState(() => (fresh: Settled) => setNews((current) => merge(current, fresh)))
  useSettledNews(onNews)
  useEffect(() => onAnnounce(onNews), [onNews])
  const total = news.ready.length + news.failed.length

  useEffect(() => {
    if (total === 0) return
    const { ready, failed } = news
    const lines = [ready.length ? t('ready', { count: ready.length, name: ready[0]?.templateName ?? '' }) : null,
      failed.length ? `${t('failed', { count: failed.length, name: failed[0]?.templateName ?? '' })} ${errors(refundKey(failed.map((job) => job.failure)))}` : null]
    notifyIfHidden(lines.filter(Boolean)[0] ?? '', lines.filter(Boolean).slice(1).join(' '), () => router.push(hrefOf(ready)))
    const hide = setTimeout(() => setNews(NONE), SHOW_MS)
    return () => clearTimeout(hide)
  }, [news, total, t, errors, router])

  if (total === 0) return null
  return <ToastCard news={news} onClose={() => setNews(NONE)} />
}

function ToastCard({ news, onClose }: { news: Settled; onClose(): void }) {
  const t = useTranslations('app.notify')
  const errors = useTranslations('app.errors')
  const { ready, failed } = news
  return (
    <div
      role="status"
      className="hairline shadow-sheet fixed top-[calc(var(--sat)+12px)] left-1/2 z-[120] flex w-[min(calc(100vw-2*var(--gutter)),480px)] -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-popover py-3 pr-3 pl-3.5 text-label leading-[1.4] motion-safe:animate-[sv-toast-in_350ms_var(--ease)]"
    >
      <span aria-hidden="true" className={failed.length && !ready.length ? 'size-2 flex-none rounded-full bg-destructive' : 'size-2 flex-none rounded-full bg-success'} />
      <p className="min-w-0 flex-1">
        {ready.length ? <b className="block font-medium">{t('ready', { count: ready.length, name: ready[0]?.templateName ?? '' })}</b> : null}
        {failed.length ? (
          <span className="block text-muted-foreground">
            {t('failed', { count: failed.length, name: failed[0]?.templateName ?? '' })} {errors(refundKey(failed.map((job) => job.failure)))}
          </span>
        ) : null}
      </p>
      {ready.length ? (
        <Link href={hrefOf(ready)} onClick={onClose} className="press hairline inline-flex min-h-9 flex-none items-center rounded-full bg-wash px-3 text-caption font-semibold">
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
