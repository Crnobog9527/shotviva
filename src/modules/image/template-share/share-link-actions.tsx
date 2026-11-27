'use client'

import { useTranslations } from 'next-intl'

import { LinkShareButtons } from '../share/link-share-buttons'

type Props = { url: string; title: string }

// A made link: shown in full (selectable), then copied or sent through the system share sheet.
export function ShareLinkActions({ url, title }: Props) {
  const t = useTranslations('app.templateShare')
  const labels = { copy: t('copy'), copied: t('copied'), share: t('shareLink'), copiedHint: t('copiedHint'), copyByHand: t('copyByHand') }
  return (
    <div className="grid gap-3">
      <input readOnly value={url} aria-label={t('linkLabel')} onFocus={(event) => event.currentTarget.select()}
        className="hairline h-12 w-full rounded-control bg-wash-faint px-4 text-caption text-bone-dim" />
      <LinkShareButtons url={url} title={title} text={t('sendText', { title })} labels={labels} />
    </div>
  )
}
