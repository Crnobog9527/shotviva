import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import { buttonVariants } from '../../ui/button'
import { HeartIcon } from './icons'

// The empty plate (B comp empty.html .state, DESIGN §4.6): an empty viewfinder frame with the
// heart, one line, a sentence, one button.
function WishlistState({ title, line, children }: { title: string; line: string; children: ReactNode }) {
  return (
    <div className="hairline-lit mx-(--gutter) mt-6 grid justify-items-center rounded-panel bg-card px-4 pt-10 pb-8 text-center md:mx-auto md:max-w-[560px] md:px-8 md:pt-12 md:pb-10">
      <div aria-hidden="true" className="relative mb-5 grid h-[90px] w-[72px] place-items-center rounded-[10px] bg-background text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)] viewfinder before:inset-2">
        <HeartIcon className="size-[22px]" />
      </div>
      <p className="text-[17px] leading-[1.3] font-semibold tracking-[-0.01em] text-balance">{title}</p>
      <p className="mt-1.5 max-w-[34ch] text-[15px] leading-normal text-pretty text-muted-foreground">{line}</p>
      {children}
    </div>
  )
}

const BUTTON = 'mt-5 w-auto min-w-[200px] px-6'

// Nothing on the wall yet (DESIGN §4.7): "Tell us what template you need" and the one primary,
// or the gate line below the threshold.
export function WallEmpty({ eligible }: { eligible: boolean }) {
  const t = useTranslations('app.wishlist')
  return (
    <WishlistState title={t('empty')} line={t('emptyLine')}>
      {eligible ? (
        <Link href="/wishlist/new" className={buttonVariants({ variant: 'cta', size: 'cta', className: BUTTON })}>
          {t('request')}
        </Link>
      ) : (
        <>
          <button type="button" disabled className={buttonVariants({ variant: 'cta', size: 'cta', className: `${BUTTON} opacity-50` })}>
            {t('request')}
          </button>
          <p className="mt-2 text-caption text-muted-foreground">{t('needPhoto')}</p>
        </>
      )}
    </WishlistState>
  )
}

// No requests of mine yet: back to the wall.
export function MineEmpty() {
  const t = useTranslations('app.wishlist.mine')
  return (
    <WishlistState title={t('empty')} line={t('emptyLine')}>
      <Link href="/wishlist" className={buttonVariants({ variant: 'glass', size: 'touch', className: `${BUTTON} min-h-12` })}>
        {t('toWall')}
      </Link>
    </WishlistState>
  )
}
