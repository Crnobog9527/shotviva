'use client'

import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import { cn } from '../../ui/cn'
import { ChevronIcon, CloseIcon, HeartIcon } from './icons'
import { useWishlistHint } from './use-hint'

// After the account's first photo (Owner 2026-11-10): one light toast from the top, which does
// not cover the bottom bar (DESIGN §8.4), pointing at the Wishlist it can now post on. The
// layout mounts this only while onboarding.wishlistHintSeen is unset and the wishlist is open,
// and only once a photo has come out.
export function WishlistHint({ markSeen }: { markSeen: () => Promise<void> }) {
  const t = useTranslations('app.wishlist.hint')
  const { visible, dismiss } = useWishlistHint(markSeen)
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(var(--sat)+12px)] z-120 flex justify-center px-(--gutter)">
      <div
        className={cn(
          'flex w-full max-w-[480px] items-center gap-2.5 rounded-control bg-popover py-2 pr-2 pl-3.5 text-[15px] leading-[1.4] transition-all duration-300 ease-house',
          'shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_var(--edge-highlight),0_24px_48px_-16px_var(--photo-fade)]',
          visible ? 'pointer-events-auto translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
        )}
      >
        {visible && (
          <>
            <HeartIcon className="size-[18px] flex-none text-primary" />
            <p className="min-w-0 flex-1">{t('text')}</p>
            <Link href="/wishlist" onClick={dismiss} className="press flex min-h-11 flex-none items-center gap-0.5 rounded-full px-2 text-label font-medium text-foreground">
              {t('open')}
              <ChevronIcon className="size-4 flex-none text-primary" />
            </Link>
            <button type="button" onClick={dismiss} aria-label={t('dismiss')} className="press grid size-11 flex-none place-items-center rounded-full text-bone-dim hover:bg-wash-strong hover:text-foreground">
              <CloseIcon />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
