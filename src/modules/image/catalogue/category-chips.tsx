'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import { ALL, SAVED } from './catalogue-filter'
import type { CatalogueCategory } from './catalogue-template'

export { ALL } from './catalogue-filter'

type Props = {
  categories: CatalogueCategory[]
  // The account has saved templates: a 「收藏」/ Saved chip leads the bar (T83).
  saved: boolean
  value: string
  onChange(next: string): void
}

// Filter chips (DESIGN "Chips"): 36px pills with a 44px hit area, one selected in solid bone.
// A horizontal rail is the one place sideways scrolling is allowed (§8.3); from md up the chips
// wrap instead (B comp create.html). The Saved chip carries a small filled heart, the same mark
// as the card's save button.
export function CategoryChips({ categories, saved, value, onChange }: Props) {
  const t = useTranslations('app.create')
  const savedName = useTranslations('app.favorites')('saved')
  const chips = [...(saved ? [{ key: SAVED, name: savedName }] : []), { key: ALL, name: t('all') }, ...categories]
  return (
    <div role="group" aria-label={t('filter')} className="no-scrollbar flex gap-2 overflow-x-auto px-(--gutter) md:flex-wrap md:overflow-visible">
      {chips.map(({ key, name }) => {
        const pressed = key === value
        return (
          <button
            key={key}
            type="button"
            aria-pressed={pressed}
            onClick={(event) => {
              onChange(key)
              event.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
            }}
            className={cn(
              "relative inline-flex min-h-9 min-w-11 flex-none items-center gap-1.5 rounded-full px-4 py-2 whitespace-nowrap text-caption leading-none font-medium transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
              pressed ? 'bg-foreground text-background' : 'hairline bg-wash text-bone-dim hover:bg-wash-strong hover:text-foreground',
            )}
          >
            {key === SAVED ? <SavedMark /> : null}
            {name}
          </button>
        )
      })}
    </div>
  )
}

function SavedMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="-ml-0.5 size-3.5 text-primary" fill="currentColor">
      <path d="M12 20.2s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.5-7.5 10.1-7.5 10.1z" />
    </svg>
  )
}
