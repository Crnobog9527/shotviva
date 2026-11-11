'use client'

import { useTranslations } from 'next-intl'

import { offersChoice, type WorkFile } from '../result/download-background'
import { useDownloadBackground } from '../result/use-download-background'
import { useTransparency } from '../result/use-share-file'

// "Format · JPG, white background" or "PNG, transparent background", only for a cut-out (from the
// work's record, or, when that is unknown, once the browser has read the result), following the
// 白底 / 透明底 choice the download below will save.
export function FormatRow({ fileUrl, work, className }: { fileUrl: string; work: WorkFile; className: string }) {
  const t = useTranslations('app.result.facts')
  const [background] = useDownloadBackground()
  if (!offersChoice(work, useTransparency(fileUrl))) return null
  return (
    <div className={className}>
      <dt className="text-caption text-muted-foreground">{t('format')}</dt>
      <dd className="text-right text-label">{t(background === 'white' ? 'formatJpgWhite' : 'formatPng')}</dd>
    </div>
  )
}
