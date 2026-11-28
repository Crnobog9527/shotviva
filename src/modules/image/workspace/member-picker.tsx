'use client'

/* eslint-disable @next/next/no-img-element -- a motion member's poster through the optimiser's srcset (coverImage) */
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { cn } from '@/core/ui/cn'
import { coverAvif, coverImage } from '@/core/ui/cover-image'
import { Picture } from '@/core/ui/picture'

import { hasStills, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { COVER_SIZES } from '../catalogue/cover-sizes'
import { PairMedia } from '../catalogue/pair-media'
import { SeriesBadge } from '../catalogue/series-badge'

// `label`: the set's name and size ("Neon Night · 4 templates"), naming the group; `badge`: which
// kind of set it is (a series, or a 精选组合 on the public pages).
type Props = { label: string; badge?: 'series' | 'bundle'; members: readonly CatalogueTemplate[]; value: string; onChange(id: string): void }

// The series' members inside its creation panel (Owner 2026-11-12, after Lovart's series
// panel): each one's before / after as a small split with its name; choosing one swaps the
// sample and the form beside it, with no second step. A native radio per member keeps it a
// keyboard and screen-reader choice. Four across under the sample from 768px; on phones one
// row that scrolls sideways, so the form stays close under it. That row shows three, so a larger
// set gets 「展开全部」 beside its name (Owner 2026-11-28): the row becomes a three-column grid of
// every member, and 「收起」 puts the row back. From 768px the grid already shows them all.
export function MemberPicker({ label, badge = 'series', members, value, onChange }: Props) {
  const t = useTranslations('app.series')
  const [all, setAll] = useState(false)
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-label leading-[1.3] font-medium">
          <SeriesBadge onPhoto={false} bundle={badge === 'bundle'} />
          <span id="series-members">{label}</span>
        </p>
        {members.length > ROW_SHOWS ? (
          <button type="button" aria-expanded={all} aria-controls="series-member-list" onClick={() => setAll(!all)}
            className="press -my-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-inner ps-2 text-caption font-medium md:hidden">
            {t(all ? 'shelfCollapse' : 'membersExpand')}
            <ChevronDown aria-hidden className={cn('size-3.5 text-muted-foreground transition-transform duration-250 ease-house', all && 'rotate-180')} />
          </button>
        ) : null}
      </div>
      <div role="radiogroup" id="series-member-list" aria-labelledby="series-members" className={cn(all ? GRID : ROW, 'md:grid md:grid-cols-4')}>
        {members.map((member, index) => (
          <MemberChoice key={member.id} member={member} chosen={member.id === value} eager={index < 4} fill={all} onChoose={() => onChange(member.id)} />
        ))}
      </div>
    </div>
  )
}

// A phone's row shows three members and part of the fourth.
const ROW_SHOWS = 3
const ROW = 'no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:overflow-visible md:px-0 md:pb-0'
const GRID = 'grid grid-cols-3 gap-2'

function MemberChoice({ member, chosen, eager, fill, onChoose }: { member: CatalogueTemplate; chosen: boolean; eager: boolean; fill: boolean; onChoose(): void }) {
  return (
    <label className={cn('relative cursor-pointer md:w-auto', fill ? 'min-w-0' : 'w-[112px] flex-none snap-start')}>
      <input type="radio" name="series-member" value={member.id} checked={chosen} onChange={onChoose} className="peer sr-only" />
      <span className={cn('press block rounded-[12px] p-1 transition-[box-shadow,background] duration-250 ease-house',
        'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring', chosen ? 'chosen' : 'hover:bg-wash-faint')}>
        <Thumb member={member} eager={eager} />
        <span className={cn('line-clamp-2 block px-1 pt-1.5 pb-0.5 text-caption leading-[1.25] font-medium', chosen ? 'text-foreground' : 'text-muted-foreground')}>
          {member.name}
        </span>
      </span>
    </label>
  )
}

// The member's own split; a motion member shows its poster still (the big sample plays it).
function Thumb({ member, eager }: { member: CatalogueTemplate; eager: boolean }) {
  if (hasStills(member)) {
    return <PairMedia before={member.cover.before as string} after={member.cover.after as string} alt="" eager={eager} size="thumb" sizes={COVER_SIZES.memberPlate} className="rounded-[9px]" />
  }
  const poster = member.cover.poster ?? member.cover.after
  if (!poster) return <span className="hairline block aspect-[8/5] rounded-[9px] bg-muted" />
  return (
    <span className="hairline relative block aspect-[8/5] overflow-hidden rounded-[9px] bg-muted">
      <Picture avif={coverAvif(poster, COVER_SIZES.memberFrame)}><img {...coverImage(poster, COVER_SIZES.memberFrame)} alt="" aria-hidden="true" loading={eager ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 size-full scale-110 object-cover blur-xl brightness-50" /></Picture>
      <Picture avif={coverAvif(poster, COVER_SIZES.memberFrame)}><img {...coverImage(poster, COVER_SIZES.memberFrame)} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 size-full object-contain" /></Picture>
    </span>
  )
}
