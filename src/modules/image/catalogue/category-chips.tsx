'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import type { CatalogueCategory } from './catalogue-template'

// Sentinel for "no filter"; the chip's label comes from the messages.
export const ALL = ''

// Filter chips (DESIGN "Chips"): 36px pills with a 44px hit area, one selected in solid bone.
// A horizontal rail is the one place sideways scrolling is allowed (§8.3); from md up the chips
// wrap instead (B comp create.html).
export function CategoryChips({ categories, value, onChange }: { categories: CatalogueCategory[]; value: string; onChange(next: string): void }) {
  const t = useTranslations('app.create')
  return (
    <div role="group" aria-label={t('filter')} className="no-scrollbar flex gap-2 overflow-x-auto px-(--gutter) md:flex-wrap md:overflow-visible">
      {[{ key: ALL, name: t('all') }, ...categories].map(({ key, name }) => {
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
              "relative min-h-9 min-w-11 flex-none rounded-full px-4 py-2 whitespace-nowrap text-caption leading-none font-medium transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
              pressed ? 'bg-foreground text-background' : 'hairline bg-wash text-bone-dim hover:bg-wash-strong hover:text-foreground',
            )}
          >
            {name}
          </button>
        )
      })}
    </div>
  )
}
