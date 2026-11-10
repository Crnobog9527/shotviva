import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import { HeartIcon } from './icons'

// The last card on Create's template grid (Owner 2026-11-10): the same footprint as a template
// card, but its frame is the empty viewfinder, waiting for the template that is not there yet.
// It links to the Wishlist; the page renders it only while the wishlist is open.
export function WishCard() {
  const t = useTranslations('app.wishlist.card')
  return (
    <Link href="/wishlist" className="group block w-full rounded-tile text-left transition-transform duration-250 ease-house active:scale-[.97]">
      <span className="relative grid aspect-[8/5] place-items-center rounded-control bg-card shadow-[inset_0_0_0_1px_var(--input)] viewfinder transition-shadow group-hover:shadow-[inset_0_0_0_1px_var(--bone-dim)]">
        <span className="grid size-12 place-items-center rounded-full bg-wash-strong text-primary">
          <HeartIcon className="size-[22px]" />
        </span>
      </span>
      <span className="block pt-2">
        <span className="block text-body leading-[1.25] font-semibold tracking-[-0.015em]">{t('title')}</span>
        <span className="mt-1 block text-caption leading-[1.35] text-muted-foreground">{t('line')}</span>
      </span>
    </Link>
  )
}
