'use client'

import { useTranslations } from 'next-intl'

import { setHeader } from '../content-edit'
import type { BlockProps } from './block-props'
import { PosterField } from './poster-field'

const KEYS = ['brand', 'brandEn', 'cup', 'cupEn', 'city', 'title', 'subtitle', 'datetimeLabel', 'datetime'] as const

export function HeaderEditor({ content, onChange, flagged }: BlockProps) {
  const t = useTranslations('app.poster')
  return (
    <div className="grid gap-3">
      {KEYS.map((key) => (
        <PosterField key={key} label={t(`header.${key}`)} value={content.header[key]} flagged={flagged(`header.${key}`)} flagNote={t('flagged')}
          onChange={(value) => onChange(setHeader(content, key, value), `header.${key}`)} />
      ))}
    </div>
  )
}
