'use client'

import { useLocale } from 'next-intl'
import { DEFAULT_LOCALE, isLocale } from '@/core/i18n/locales'
import { CopyLink } from '../copy-link'
import { consumerReferralUrl } from '../consumer-link'
import { COPY } from './copy'

export function ConsumerReferral({ slug }: { slug: string }) {
  const locale = useLocale()
  return (
    <div className="grid w-full min-w-0 gap-1 text-sm">
      <p>{COPY.consumerLink}</p>
      <CopyLink url={consumerReferralUrl(slug, isLocale(locale) ? locale : DEFAULT_LOCALE)} copy={COPY.copyLink} copied={COPY.copied} />
    </div>
  )
}
