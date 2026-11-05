'use client'

import { cn } from '@/core/ui/cn'

export const ALL = 'All'

// Filter chips (DESIGN "Chips"): 36px pills with a 44px hit area, one selected in solid bone.
// A horizontal rail is the one place sideways scrolling is allowed (§8.3).
export function CategoryChips({ categories, value, onChange }: { categories: string[]; value: string; onChange(next: string): void }) {
  return (
    <div role="group" aria-label="Filter templates" className="no-scrollbar flex gap-2 overflow-x-auto px-4">
      {[ALL, ...categories].map((category) => {
        const pressed = category === value
        return (
          <button
            key={category}
            type="button"
            aria-pressed={pressed}
            onClick={(event) => {
              onChange(category)
              event.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
            }}
            className={cn(
              "relative h-9 min-w-11 flex-none rounded-full px-4 text-caption leading-none font-medium transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
              pressed ? 'bg-foreground text-background' : 'hairline bg-wash text-bone-dim',
            )}
          >
            {category}
          </button>
        )
      })}
    </div>
  )
}
