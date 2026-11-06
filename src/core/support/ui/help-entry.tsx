import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { UnreadDot } from './unread-dot'

// The Account page's way in to Help & feedback, with the "new reply" dot when the Owner has
// answered. No refund wording here or near the subscription block (ARCHITECTURE §10).
export function HelpEntry({ unread }: { unread: boolean }) {
  const t = useTranslations('app.support')
  return (
    <Link href="/account/help" className="press flex min-h-11 items-center gap-3">
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex items-center gap-2 text-headline leading-[1.25] font-semibold">
          {t('title')}
          {unread && <UnreadDot label={t('newReply')} />}
        </span>
        <span className="text-body text-bone-dim">{t('entryHint')}</span>
      </span>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}
