'use client'

import { useTranslations } from 'next-intl'

import type { WorkFile } from '../result/download-background'
import { useCutOutChoice } from '../result/use-download-background'

// "Format · JPG, white background" or "PNG, transparent background", only for a cut-out (from the
// work's record, or, when that is unknown, once the browser has read the result), following the
// photo's 白底 / 透明 chips, the file the download below will save.
export function FormatRow({ fileUrl, work, className }: { fileUrl: string; work: WorkFile; className: string }) {
  const t = useTranslations('app.result.facts')
  const [background] = useCutOutChoice(fileUrl, work)
  if (!background) return null
  return (
    <div className={className}>
      <dt className="text-caption text-muted-foreground">{t('format')}</dt>
      <dd className="text-right text-label">{t(background === 'white' ? 'formatJpgWhite' : 'formatPng')}</dd>
    </div>
  )
}
