'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { PosterContent } from '@/core/poster'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'

import { setPrize } from '../content-edit'
import type { BlockProps } from './block-props'
import { PosterField } from './poster-field'

type Row = NonNullable<PosterContent['prizes']>['rows'][number]

// A row's place in the display area (§5.3 展示位): its spot (null: text only), whether the area is
// full (it cannot join) or this is its last prize (it cannot leave), and the spot's photo box.
export type RowSpot = { spot: number | null; full: boolean; last: boolean; photo: ReactNode }

type Props = BlockProps & { row: Row; index: number; spot: RowSpot | null; onFeature(on: boolean): void; onRemove(): void }

export function PrizeRowCard({ row, index: i, spot, onFeature, onRemove, content, onChange, flagged, sample }: Props) {
  const t = useTranslations('app.poster')
  return (
    <li className="grid gap-2 rounded-control bg-card p-3 hairline">
      <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
        <PosterField compact label={t('prizes.rank')} value={row.rank} flagged={flagged(`prizes.rows.${i}.rank`)} sample={sample(`prizes.rows.${i}.rank`)}
          onChange={(value) => onChange(setPrize(content, i, 'rank', value), `prizes.rows.${i}.rank`)} />
        <PosterField compact label={t('prizes.rankEn')} value={row.rankEn} flagged={flagged(`prizes.rows.${i}.rankEn`)} sample={sample(`prizes.rows.${i}.rankEn`)}
          onChange={(value) => onChange(setPrize(content, i, 'rankEn', value), `prizes.rows.${i}.rankEn`)} />
        <Button variant="ghost" size="sm" aria-label={t('remove')} onClick={onRemove}>✕</Button>
      </div>
      <PosterField compact label={t('prizes.prize')} value={row.prize} flagged={flagged(`prizes.rows.${i}.prize`)} sample={sample(`prizes.rows.${i}.prize`)}
        onChange={(value) => onChange(setPrize(content, i, 'prize', value), `prizes.rows.${i}.prize`)} />
      {spot ? <FeatureControls spot={spot} onFeature={onFeature} /> : null}
    </li>
  )
}

function FeatureControls({ spot, onFeature }: { spot: RowSpot; onFeature(on: boolean): void }) {
  const t = useTranslations('app.poster.prizes')
  const on = spot.spot !== null
  const blocked = on ? spot.last : spot.full
  return (
    <div className="grid gap-2">
      <label className="flex min-h-11 items-center gap-3 text-caption">
        <Checkbox checked={on} disabled={blocked} onCheckedChange={(checked) => onFeature(checked === true)} />
        <span className="grid">
          <span className="font-medium">{t('featured')}</span>
          {blocked ? <span className="text-muted-foreground">{t(on ? 'featuredLast' : 'featuredFull')}</span> : null}
        </span>
      </label>
      {on && spot.photo ? (
        <div className="grid gap-2">
          <span className="text-caption font-medium">{t('featuredPhoto')}</span>
          {spot.photo}
          <span className="text-caption text-muted-foreground">{t('featuredPhotoHint')}</span>
        </div>
      ) : null}
    </div>
  )
}
