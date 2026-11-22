import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { UsersRound } from 'lucide-react'

import { CopyLink } from '@/core/affiliate/copy-link'

// On /account, under the owner's 「企业」 row (Owner 2026-11-22): the enterprise affiliate's
// customer link with one-tap copy, labelled as the link for customers so it is never confused with
// the staff-only link in the workspace. Shown only when the org's affiliate is on.
export function CustomerLinkRow({ url }: { url: string }) {
  const t = useTranslations('app.org.entry')
  const id = useId()
  return (
    <section aria-labelledby={id} className="hairline-lit mt-2 rounded-panel bg-card p-4">
      <h3 id={id} className="flex items-center gap-2 text-body font-semibold">
        <UsersRound aria-hidden strokeWidth={1.75} className="size-[18px] shrink-0 text-primary" />{t('customerTitle')}
      </h3>
      <p className="mt-1 mb-3 text-label text-muted-foreground">{t('customerHint')}</p>
      <CopyLink url={url} copy={t('copy')} copied={t('copied')} />
    </section>
  )
}
