'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { cn } from '@/core/ui/cn'

import { useFavorites, type FavoriteSurface } from './favorites-provider'

type Props = {
  template: { id: string; name: string; category: string }
  surface: FavoriteSurface
  // Where it sits on the photo (absolute; the parent is relative).
  className?: string
}

// The save heart (ARCHITECTURE §5.1b): a 32px frosted disc on the template's photo, like the
// "Phone" tag, inside a 44px target. Outline at rest; saved, it fills in Safelight (the colour of
// a chosen template) with one small pop. A toggle button: the name stays "Save ‹template›" and
// aria-pressed says whether it is saved. Nothing is drawn outside a FavoritesProvider.
export function FavoriteButton({ template, surface, className }: Props) {
  const t = useTranslations('app.favorites')
  const favorites = useFavorites()
  const [pop, setPop] = useState(false)
  if (!favorites) return null
  const saved = favorites.isSaved(template.id)
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={t('save', { name: template.name })}
      // Keeps a drag compare, a drawer's drag and the card's own tap out of it.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        setPop(!saved)
        favorites.toggle(template, surface)
      }}
      className={cn('group/heart absolute z-5 grid size-11 place-items-center rounded-full', className)}
    >
      <span className="frost grid size-8 place-items-center rounded-full transition-transform duration-180 ease-house group-active/heart:scale-90">
        <HeartIcon saved={saved} pop={pop} onPopped={() => setPop(false)} />
      </span>
    </button>
  )
}

function HeartIcon({ saved, pop, onPopped }: { saved: boolean; pop: boolean; onPopped(): void }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      onAnimationEnd={onPopped}
      className={cn('size-[18px] transition-colors duration-180', saved ? 'text-primary' : 'text-photo-ink', pop && 'animate-heart-pop')}
      fill={saved ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.2s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.5-7.5 10.1-7.5 10.1z" />
    </svg>
  )
}
