'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

import { buttonVariants } from '@/core/ui/button'

import { usePhoneSave } from '../batch/batch-save-button'
import { PhotoSaveButton } from '../batch/photo-save-button'
import { downloadEach, pickedSource } from './bulk-save'

// "Download" for the works picked on Photos. On a phone that can share files they go to the
// photo library through the share sheet, ten at a time (as a batch's Save all does); anywhere
// else each file is downloaded on its own. Remount it (key) when the picked works change.
export function BulkSaveButton({ jobIds }: { jobIds: readonly string[] }) {
  const phone = usePhoneSave()
  const [refused, setRefused] = useState(false)
  const links = useMemo(() => pickedSource(jobIds), [jobIds])
  if (phone && !refused) return <PhotoSaveButton links={links} count={jobIds.length} className="min-w-0 flex-1" onUnsupported={() => setRefused(true)} />
  return <DownloadEach jobIds={jobIds} />
}

function DownloadEach({ jobIds }: { jobIds: readonly string[] }) {
  const t = useTranslations('app.workShare.bulk')
  const [started, setStarted] = useState<number | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const total = jobIds.length
  const busy = started !== null && started < total
  const run = () => {
    setStarted(0)
    void downloadEach(jobIds, (n) => alive.current && setStarted(n), () => alive.current)
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <button type="button" onClick={run} disabled={total === 0 || busy} aria-busy={busy} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'gap-2' })}>
        {t('download', { count: total })}
      </button>
      <p aria-live="polite" className={started === null ? 'sr-only' : 'mt-1.5 text-caption leading-[1.4] text-muted-foreground'}>
        {started === null ? null : started < total ? t('downloading', { started, total }) : t('downloaded', { total })}
      </p>
    </div>
  )
}
