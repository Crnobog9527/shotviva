'use client'

import { useTranslations } from 'next-intl'

import { setFooter, setPhones } from '../content-edit'
import type { BlockProps } from './block-props'
import { PosterField } from './poster-field'

const KEYS = ['phonesLabel', 'addressLabel', 'address', 'qrLabel'] as const

export function FooterEditor({ content, onChange, flagged }: BlockProps) {
  const t = useTranslations('app.poster')
  const phonesFlagged = content.footer.phones.some((_, i) => flagged(`footer.phones.${i}`))
  return (
    <div className="grid gap-3">
      <PosterField label={t('footer.phones')} multiline value={content.footer.phones.join('\n')} flagged={phonesFlagged} flagNote={t('flagged')}
        onChange={(value) => onChange(setPhones(content, value), 'footer.phones.0')} />
      {KEYS.map((key) => (
        <PosterField key={key} label={t(`footer.${key}`)} value={content.footer[key]} flagged={flagged(`footer.${key}`)} flagNote={t('flagged')}
          onChange={(value) => onChange(setFooter(content, key, value), `footer.${key}`)} />
      ))}
    </div>
  )
}
