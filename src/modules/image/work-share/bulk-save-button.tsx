'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { buttonVariants } from '@/core/ui/button'

import { PhotoSaveButton } from '../batch/photo-save-button'
import { saveRoute } from './album-save'
import { AlbumView } from './album-view'
import { downloadEach, pickedSource, toDownload, type DownloadProgress } from './bulk-save'
import type { BulkSavedAction } from './share-types'

// "Download" for the works picked on Photos, by what the browser can do (album-save.ts): a phone
// that can share files sends them to the photo library through the share sheet, ten at a time (as
// a batch's Save all does); a phone that cannot opens the album view, where a long press saves
// each one to the gallery; a desktop fetches and saves each file. Remount it (key) when the
// picked works change.
export function BulkSaveButton({ jobIds, saved }: { jobIds: readonly string[]; saved?: BulkSavedAction }) {
  const coarse = useCoarsePointer()
  const [refused, setRefused] = useState(false)
  const links = useMemo(() => pickedSource(jobIds), [jobIds])
  const route = coarse === null ? null : saveRoute(coarse, navigator, refused)
  if (route === 'share') return <PhotoSaveButton links={links} count={jobIds.length} className="min-w-0 flex-1" onUnsupported={() => setRefused(true)} />
  if (route === 'album') return <AlbumButton jobIds={jobIds} saved={saved} />
  return <DownloadEach jobIds={jobIds} />
}

const COARSE = '(pointer: coarse)'
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(COARSE)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}
// null on the server; the bar itself only renders in the browser.
const useCoarsePointer = () => useSyncExternalStore<boolean | null>(subscribe, () => window.matchMedia(COARSE).matches, () => null)

// Opens the album view. The line under it says why this is not a plain download.
function AlbumButton({ jobIds, saved }: { jobIds: readonly string[]; saved?: BulkSavedAction }) {
  const t = useTranslations('app.workShare.bulk')
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'gap-2' })}>
        {t('album', { count: jobIds.length })}
      </button>
      <p className="mt-1.5 text-caption leading-[1.4] text-muted-foreground">{t('albumWhy')}</p>
      {open ? <AlbumView jobIds={jobIds} saved={saved} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

// done: what the finished runs came to (saved adds up over retries; failed is what is left).
// run: the round under way, null between rounds.
type Round = { ids: readonly string[]; now: DownloadProgress }

function DownloadEach({ jobIds }: { jobIds: readonly string[] }) {
  const t = useTranslations('app.workShare.bulk')
  const [done, setDone] = useState<DownloadProgress | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const left = toDownload(jobIds, done)
  const run = () => {
    const ids = left
    const before = done?.saved ?? 0
    setRound({ ids, now: { saved: 0, failed: [] } })
    void downloadEach(ids, (now) => alive.current && setRound({ ids, now }), () => alive.current).then((result) => {
      if (!alive.current) return
      setRound(null)
      setDone({ saved: before + result.saved, failed: result.failed })
    })
  }
  const retry = done !== null && done.failed.length > 0
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <button type="button" onClick={run} disabled={left.length === 0 || round !== null} aria-busy={round !== null} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'gap-2' })}>
        {retry ? t('downloadRetry', { count: left.length }) : t('download', { count: jobIds.length })}
      </button>
      <p aria-live="polite" className={round || done ? 'mt-1.5 text-caption leading-[1.4] text-muted-foreground' : 'sr-only'}>
        {round ? t('downloading', { started: Math.min(round.now.saved + round.now.failed.length + 1, round.ids.length), total: round.ids.length }) : done ? <DownloadResult progress={done} /> : null}
      </p>
    </div>
  )
}

// Only what really arrived is counted as downloaded; the rest is said, and the button then asks
// for those only.
function DownloadResult({ progress }: { progress: DownloadProgress }) {
  const t = useTranslations('app.workShare.bulk')
  if (progress.failed.length === 0) return t('downloaded', { total: progress.saved })
  return (
    <span className="text-destructive">
      {progress.saved > 0 ? `${t('downloaded', { total: progress.saved })} ` : null}
      {t('downloadFailed', { count: progress.failed.length })}
    </span>
  )
}
