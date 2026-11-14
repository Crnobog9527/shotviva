'use client'

import { useTranslations } from 'next-intl'

import { openConsentSettings } from '../consent/store'

// The footer's way back to the bar (T70), for every visitor, asked or not.
export function CookieSettingsButton({ className }: { className?: string }) {
  const t = useTranslations('footer')
  return (
    <button type="button" data-cookie-settings="" className={className} onClick={openConsentSettings}>
      {t('cookieSettings')}
    </button>
  )
}
