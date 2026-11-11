'use client'

import { useTranslations } from 'next-intl'

import { offersChoice, type WorkFile } from '../result/download-background'
import { useTransparency } from '../result/use-share-file'

// "Format · PNG, transparent background", only for a cut-out: from the work's record, or, when that
// is unknown, once the result has been read in the browser (the fetch the photo and Share share).
export function FormatRow({ fileUrl, work, className }: { fileUrl: string; work: WorkFile; className: string }) {
  const t = useTranslations('app.result.facts')
  if (!offersChoice(work, useTransparency(fileUrl))) return null
  return (
    <div className={className}>
      <dt className="text-caption text-muted-foreground">{t('format')}</dt>
      <dd className="text-right text-label">{t('formatPng')}</dd>
    </div>
  )
}
