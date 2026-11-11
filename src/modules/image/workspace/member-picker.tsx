'use client'

/* eslint-disable @next/next/no-img-element -- a motion member's poster through the optimiser's srcset (coverImage) */
import { cn } from '@/core/ui/cn'
import { coverImage } from '@/core/ui/cover-image'

import { hasStills, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { COVER_SIZES } from '../catalogue/cover-sizes'
import { PairMedia } from '../catalogue/pair-media'

// `label`: the series' name and size ("Neon Night · 4 templates"), naming the group.
type Props = { label: string; members: readonly CatalogueTemplate[]; value: string; onChange(id: string): void }

// The series' members inside its creation panel (Owner 2026-11-12, after Lovart's series
// panel): each one's before / after as a small split with its name; choosing one swaps the
// sample and the form beside it, with no second step. A native radio per member keeps it a
// keyboard and screen-reader choice. Four across under the sample from 768px; on phones one
// row that scrolls sideways, so the form stays close under it.
export function MemberPicker({ label, members, value, onChange }: Props) {
  return (
    <div>
      <p id="series-members" className="mb-2 text-label leading-[1.3] font-medium">{label}</p>
      <div role="radiogroup" aria-labelledby="series-members"
        className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0">
        {members.map((member, index) => (
          <MemberChoice key={member.id} member={member} chosen={member.id === value} eager={index < 4} onChoose={() => onChange(member.id)} />
        ))}
      </div>
    </div>
  )
}

function MemberChoice({ member, chosen, eager, onChoose }: { member: CatalogueTemplate; chosen: boolean; eager: boolean; onChoose(): void }) {
  return (
    <label className="relative w-[112px] flex-none cursor-pointer snap-start md:w-auto">
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
      <img {...coverImage(poster, COVER_SIZES.memberFrame)} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 size-full object-cover" />
    </span>
  )
}
