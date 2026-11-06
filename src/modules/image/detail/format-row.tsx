'use client'

import { useTranslations } from 'next-intl'

import { useTransparency } from '../result/use-share-file'

// "Format · PNG, transparent background", only for a cut-out; known once the result has been
// read in the browser (the same single fetch the photo and Share already share).
export function FormatRow({ fileUrl, className }: { fileUrl: string; className: string }) {
  const t = useTranslations('app.result.facts')
  if (!useTransparency(fileUrl)) return null
  return (
    <div className={className}>
      <dt className="text-caption text-muted-foreground">{t('format')}</dt>
      <dd className="text-right text-label">{t('formatPng')}</dd>
    </div>
  )
}
