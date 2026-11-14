'use client'

import { useTranslations } from 'next-intl'

import { setHeader } from '../content-edit'
import type { BlockProps } from './block-props'
import type { HeaderKey } from './block-folds'
import { PosterField } from './poster-field'

// keys: the part of the header this fold shows (its masthead or its title lines).
export function HeaderEditor({ content, onChange, flagged, keys }: BlockProps & { keys: readonly HeaderKey[] }) {
  const t = useTranslations('app.poster')
  return (
    <div className="grid gap-3">
      {keys.map((key) => (
        <PosterField key={key} label={t(`header.${key}`)} value={content.header[key]} flagged={flagged(`header.${key}`)} flagNote={t('flagged')}
          onChange={(value) => onChange(setHeader(content, key, value), `header.${key}`)} />
      ))}
    </div>
  )
}
