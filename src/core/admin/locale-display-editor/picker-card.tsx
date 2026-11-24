'use client'

import { Check } from 'lucide-react'

import { effectiveStillCover } from '@/core/templates/client'
import { coverImage } from '@/core/ui/cover-image'
import { cn } from '@/core/ui/cn'

import { zhNameOf } from '../templates-editor/featured-card'
import type { AdminTemplate } from '../templates/types'
import type { DisplayLocale } from '../locale-display/types'
import { PICKER_COPY as COPY } from './picker-copy'

type Props = {
  template: AdminTemplate
  // Where it is filed, as a path (餐饮 › 甜点).
  place: string
  locale: DisplayLocale
  // Already in this language's list: shown, not pickable.
  taken: boolean
  selected: boolean
  onToggle: () => void
}

// One template in the picker: before and after covers as this language's pages show them, its
// Chinese name and category. The whole card is the checkbox.
export function PickerCard({ template, place, locale, taken, selected, onToggle }: Props) {
  const name = zhNameOf(template, template.id)
  return (
    <li>
      <button type="button" role="checkbox" aria-checked={selected || taken} disabled={taken} onClick={onToggle}
        className={cn('grid w-full gap-1.5 rounded-lg border p-1.5 text-left transition-colors',
          selected ? 'border-primary ring-2 ring-primary/40' : 'hover:border-foreground/30', taken && 'cursor-not-allowed opacity-55')}>
        <span className="relative grid grid-cols-2 gap-1">
          <Cover url={effectiveStillCover(template.coverLocales, locale, 'before', template.coverBeforeUrl)} label={COPY.before} />
          <Cover url={effectiveStillCover(template.coverLocales, locale, 'after', template.coverAfterUrl)} label={COPY.after} />
          {selected || taken ? (
            <span className="absolute top-1 right-1 flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[11px] text-primary-foreground">
              <Check aria-hidden className="size-3" />{taken ? COPY.taken : COPY.picked}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 px-0.5">
          <span className="block truncate text-sm font-medium" title={name}>{name}</span>
          <span className="block truncate text-xs text-muted-foreground" title={place}>{place}</span>
        </span>
      </button>
    </li>
  )
}

function Cover({ url, label }: { url: string | null; label: string }) {
  const box = 'aspect-[4/5] w-full rounded-md bg-muted'
  if (!url) return <span className={cn(box, 'flex items-center justify-center text-[10px] text-muted-foreground')}>{COPY.noCover}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- coverImage() supplies the optimiser's srcset
    <img {...coverImage(url, '96px')} alt={label} loading="lazy" decoding="async" draggable={false} className={cn(box, 'object-cover')} />
  )
}
