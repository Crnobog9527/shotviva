'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { cn } from '../../ui/cn'
import { CheckIcon, CloseIcon } from './icons'

const VISIBLE_MS = 10_000

// "Sent for review." after posting (B comp wishlist.html ?sent=1): a toast from the top that
// does not cover the tab bar (DESIGN §8.4), dismissable, gone after 10 seconds. The post form
// returns to /wishlist?sent=1; the flag is dropped from the address at once so a reload does
// not show it again.
export function SentNotice() {
  const t = useTranslations('app.wishlist')
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [visible, setVisible] = useState(() => params.get('sent') === '1')

  useEffect(() => {
    if (!visible) return
    router.replace(pathname, { scroll: false })
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [visible, pathname, router])

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(var(--sat)+12px)] z-120 flex justify-center px-(--gutter)">
      <div
        className={cn(
          'flex w-full max-w-[480px] items-center gap-2.5 rounded-control bg-popover py-3 pr-3 pl-3.5 text-[15px] leading-[1.4] transition-all duration-300 ease-house',
          'shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_var(--edge-highlight),0_24px_48px_-16px_var(--photo-fade)]',
          visible ? 'pointer-events-auto translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
        )}
      >
        {visible && (
          <>
            <CheckIcon />
            <p className="min-w-0 flex-1">{t.rich('sent', { b: (chunks) => <b className="font-medium">{chunks}</b> })}</p>
            <button type="button" onClick={() => setVisible(false)} aria-label={t('dismiss')} className="press -my-1.5 -mr-1 grid size-9 flex-none place-items-center rounded-full text-bone-dim hover:bg-wash-strong hover:text-foreground">
              <CloseIcon />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
