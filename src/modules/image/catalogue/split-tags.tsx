import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

// Where the two tags sit: small at the bottom corners of a card's pair, larger at the bottom of a
// dialog's pair, larger at the top of the drag compare (B comp app.css .pair / .compare).
const PLACES = {
  card: { base: 'bottom-2 min-h-6 px-2', left: 'left-2', right: 'right-2' },
  pair: { base: 'bottom-3 min-h-7 px-2.5', left: 'left-3', right: 'right-3' },
  large: { base: 'top-3 min-h-7 px-3', left: 'left-3', right: 'right-3' },
  feature: { base: 'top-3 min-h-7 px-2.5', left: 'left-3', right: 'right-3' },
} as const

// "Phone" / "AI" on every split, the same two words on cards, the creation dialog and the
// generator (The Always-Visible Split Rule). Hidden from readers: the image alt already says it.
export function SplitTags({ hidden = false, size = 'card' }: { hidden?: boolean; size?: keyof typeof PLACES }) {
  const t = useTranslations('app.template')
  const place = PLACES[size]
  const base = cn(
    'absolute z-4 inline-flex items-center rounded-tag py-1 text-caption leading-none font-semibold transition-opacity duration-300',
    place.base,
    hidden && 'opacity-0',
  )
  return (
    <>
      <span aria-hidden="true" className={cn(base, 'frost text-photo-ink', place.left)}>
        {t('phone')}
      </span>
      <span aria-hidden="true" className={cn(base, 'text-primary-foreground', size === 'card' ? 'bg-[var(--safelight-tag)]' : 'bg-primary', place.right)}>
        {t('ai')}
      </span>
    </>
  )
}

// "Illustrative example" on a photo: frosted, 26px.
export function ExampleBadge({ className }: { className?: string }) {
  const t = useTranslations('app.template')
  return (
    <span className={cn('frost absolute z-4 inline-flex h-[26px] items-center rounded-tag px-2 text-caption leading-none font-medium text-photo-ink', className)}>
      {t('example')}
    </span>
  )
}
