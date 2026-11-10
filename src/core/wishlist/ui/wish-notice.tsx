'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Link } from '../../i18n/ui/localized-link'
import type { NoticeItem } from '../notice-items'
import { ChevronIcon, CloseIcon, HeartIcon } from './icons'
import { useWishNotices, type MarkNoticesSeen } from './use-wish-notices'

type Props = { items: NoticeItem[]; markSeen: MarkNoticesSeen }

// "Your wish came true" (ARCHITECTURE §15.4, T106): the wishlist hint's light card from the top,
// which does not cover the bottom bar (DESIGN §8.4). It sits under drawers and dialogs (z-100),
// over the tab and action bars (z-60), and stays until closed: the moment is the point, and an
// unread one is marked seen as it comes up. Its heart is filled where the hint draws an outline.
export function WishNotice({ items, markSeen }: Props) {
  const t = useTranslations('app.wishlist.notice')
  const { current, remaining, dismiss, close } = useWishNotices(items, markSeen)
  if (!current) return null
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(var(--sat)+12px)] z-90 flex justify-center px-(--gutter)">
      <div
        key={current.requestId}
        className="notice-in pointer-events-auto flex w-full max-w-[480px] items-center gap-2.5 rounded-control bg-popover py-2 pr-2 pl-3.5 shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_var(--edge-highlight),0_24px_48px_-16px_var(--photo-fade)]"
      >
        <HeartIcon className="size-[18px] flex-none fill-primary text-primary" />
        <NoticeText item={current} remaining={remaining} />
        <Link href={`/generate/${current.templateId}`} onClick={close} className="press flex min-h-11 flex-none items-center gap-0.5 rounded-full px-2 text-label font-medium text-foreground">
          {t('open')}
          <ChevronIcon className="size-4 flex-none text-primary" />
        </Link>
        <button type="button" onClick={dismiss} aria-label={t('dismiss')} className="press grid size-11 flex-none place-items-center rounded-full text-bone-dim hover:bg-wash-strong hover:text-foreground">
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}

function NoticeText({ item, remaining }: { item: NoticeItem; remaining: number }) {
  const t = useTranslations('app.wishlist.notice')
  const name = (chunks: ReactNode) => <span className="font-medium text-foreground">{chunks}</span>
  return (
    <p className="line-clamp-2 min-w-0 flex-1 text-[15px] leading-[1.4] text-pretty text-bone-dim">
      {t.rich(item.isAuthor ? 'author' : 'voter', { template: item.templateName, name })}
      {remaining > 0 && (
        <span className="ml-1.5 inline-block rounded-full bg-wash-strong px-1.5 align-[1px] text-[12px] leading-[18px] font-medium text-bone-dim tabular-nums">
          <span aria-hidden="true">+{remaining}</span>
          <span className="sr-only">{t('more', { count: remaining })}</span>
        </span>
      )}
    </p>
  )
}
