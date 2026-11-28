'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

import { buttonVariants } from '@/core/ui/button'

import { usePhoneSave } from '../batch/batch-save-button'
import { PhotoSaveButton } from '../batch/photo-save-button'
import { downloadEach, pickedSource, type DownloadProgress } from './bulk-save'

// "Download" for the works picked on Photos. On a phone that can share files they go to the
// photo library through the share sheet, ten at a time (as a batch's Save all does); anywhere
// else each file is fetched and saved on its own. Remount it (key) when the picked works change.
export function BulkSaveButton({ jobIds }: { jobIds: readonly string[] }) {
  const phone = usePhoneSave()
  const [refused, setRefused] = useState(false)
  const links = useMemo(() => pickedSource(jobIds), [jobIds])
  if (phone && !refused) return <PhotoSaveButton links={links} count={jobIds.length} className="min-w-0 flex-1" onUnsupported={() => setRefused(true)} />
  return <DownloadEach jobIds={jobIds} />
}

function DownloadEach({ jobIds }: { jobIds: readonly string[] }) {
  const t = useTranslations('app.workShare.bulk')
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const total = jobIds.length
  const done = progress ? progress.saved + progress.failed : 0
  const busy = progress !== null && done < total
  const run = () => {
    setProgress({ saved: 0, failed: 0 })
    void downloadEach(jobIds, (now) => alive.current && setProgress(now), () => alive.current)
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <button type="button" onClick={run} disabled={total === 0 || busy} aria-busy={busy} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'gap-2' })}>
        {t('download', { count: total })}
      </button>
      <p aria-live="polite" className={progress === null ? 'sr-only' : 'mt-1.5 text-caption leading-[1.4] text-muted-foreground'}>
        {progress === null ? null : busy ? t('downloading', { started: done + 1, total }) : <DownloadResult progress={progress} />}
      </p>
    </div>
  )
}

// Only what really arrived is counted as downloaded; the rest is said, and the button tries again.
function DownloadResult({ progress }: { progress: DownloadProgress }) {
  const t = useTranslations('app.workShare.bulk')
  if (progress.failed === 0) return t('downloaded', { total: progress.saved })
  return (
    <span className="text-destructive">
      {progress.saved > 0 ? `${t('downloaded', { total: progress.saved })} ` : null}
      {t('downloadFailed', { count: progress.failed })}
    </span>
  )
}
