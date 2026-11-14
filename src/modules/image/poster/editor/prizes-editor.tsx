'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'

import { addPrize, removePrize, setPrize, setPrizeHeading } from '../content-edit'
import type { BlockProps } from './block-props'
import { PosterField } from './poster-field'

// The prize list: a headline, a note, then one card per rank (rank, its English, the prize).
export function PrizesEditor({ content, onChange, flagged, sample }: BlockProps) {
  const t = useTranslations('app.poster')
  const prizes = content.prizes ?? { headline: '', note: '', rows: [] }
  return (
    <div className="grid gap-3">
      <PosterField label={t('prizes.headline')} value={prizes.headline} flagged={flagged('prizes.headline')} sample={sample('prizes.headline')} flagNote={t('flagged')}
        onChange={(value) => onChange(setPrizeHeading(content, 'headline', value), 'prizes.headline')} />
      <PosterField label={t('prizes.note')} value={prizes.note} flagged={flagged('prizes.note')} sample={sample('prizes.note')} flagNote={t('flagged')}
        onChange={(value) => onChange(setPrizeHeading(content, 'note', value), 'prizes.note')} />
      <ol className="grid gap-2">
        {prizes.rows.map((row, i) => (
          <li key={i} className="grid gap-2 rounded-control bg-card p-3 hairline">
            <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <PosterField compact label={t('prizes.rank')} value={row.rank} flagged={flagged(`prizes.rows.${i}.rank`)} sample={sample(`prizes.rows.${i}.rank`)}
                onChange={(value) => onChange(setPrize(content, i, 'rank', value), `prizes.rows.${i}.rank`)} />
              <PosterField compact label={t('prizes.rankEn')} value={row.rankEn} flagged={flagged(`prizes.rows.${i}.rankEn`)} sample={sample(`prizes.rows.${i}.rankEn`)}
                onChange={(value) => onChange(setPrize(content, i, 'rankEn', value), `prizes.rows.${i}.rankEn`)} />
              <Button variant="ghost" size="sm" aria-label={t('remove')} onClick={() => onChange(removePrize(content, i), `prizes.rows.${i}`)}>✕</Button>
            </div>
            <PosterField compact label={t('prizes.prize')} value={row.prize} flagged={flagged(`prizes.rows.${i}.prize`)} sample={sample(`prizes.rows.${i}.prize`)}
              onChange={(value) => onChange(setPrize(content, i, 'prize', value), `prizes.rows.${i}.prize`)} />
          </li>
        ))}
      </ol>
      <Button variant="outline" className="min-h-11" onClick={() => onChange(addPrize(content), 'prizes.rows')}>{t('prizes.add')}</Button>
    </div>
  )
}
