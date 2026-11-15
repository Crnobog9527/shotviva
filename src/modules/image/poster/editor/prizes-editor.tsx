'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { featuredPrizes } from '@/core/poster'
import { Button } from '@/core/ui/button'

import { addPrize, removePrize, setFeatured, setPrizeHeading } from '../content-edit'
import type { BlockProps } from './block-props'
import { PosterField } from './poster-field'
import { PrizeRowCard, type RowSpot } from './prize-row'

// The prize page's display area (§5.3 展示位): how many prizes it draws as products, each spot's
// photo box (null: the template takes no photo), and emptying a spot's box.
export type Display = { count: number; photo(spot: number): ReactNode; clear(spot: number): void }

// The prize list: a headline, a note, then one card per rank (rank, its English, the prize). With a
// display area, each card says whether its prize is drawn there and, if so, takes its photo.
export function PrizesEditor({ content, onChange, flagged, sample, display }: BlockProps & { display: Display | null }) {
  const t = useTranslations('app.poster')
  const prizes = content.prizes ?? { headline: '', note: '', rows: [] }
  const chosen = display ? featuredPrizes(prizes.rows, display) : []
  const toggle = (i: number, on: boolean) => {
    if (!display) return
    const next = setFeatured(content, i, on, display.count)
    for (const spot of [next.freed, next.taken]) if (spot !== undefined) display.clear(spot)
    onChange(next.content, `prizes.rows.${i}.featured`)
  }
  // A removed prize's photo goes with it, so it can never turn up under another prize.
  const remove = (i: number) => {
    const spot = chosen.find((item) => item.row === i)?.spot
    if (display && spot !== undefined) display.clear(spot)
    onChange(removePrize(content, i), `prizes.rows.${i}`)
  }
  const spotOf = (i: number): RowSpot | null => {
    if (!display) return null
    const spot = chosen.find((item) => item.row === i)?.spot
    return { spot: spot ?? null, full: spot === undefined && chosen.length >= display.count, last: spot !== undefined && chosen.length <= 1, photo: spot === undefined ? null : display.photo(spot) }
  }
  return (
    <div className="grid gap-3">
      <PosterField label={t('prizes.headline')} value={prizes.headline} flagged={flagged('prizes.headline')} sample={sample('prizes.headline')} flagNote={t('flagged')}
        onChange={(value) => onChange(setPrizeHeading(content, 'headline', value), 'prizes.headline')} />
      <PosterField label={t('prizes.note')} value={prizes.note} flagged={flagged('prizes.note')} sample={sample('prizes.note')} flagNote={t('flagged')}
        onChange={(value) => onChange(setPrizeHeading(content, 'note', value), 'prizes.note')} />
      {display ? <p className="rounded-control bg-wash-faint p-3 text-caption text-muted-foreground">{t('prizes.featuredIntro', { count: display.count, chosen: chosen.length })}</p> : null}
      <ol className="grid gap-2">
        {prizes.rows.map((row, i) => (
          <PrizeRowCard key={i} row={row} index={i} spot={spotOf(i)} onFeature={(on) => toggle(i, on)}
            onRemove={() => remove(i)} {...{ content, onChange, flagged, sample }} />
        ))}
      </ol>
      <Button variant="outline" className="min-h-11" onClick={() => onChange(addPrize(content), 'prizes.rows')}>{t('prizes.add')}</Button>
    </div>
  )
}
