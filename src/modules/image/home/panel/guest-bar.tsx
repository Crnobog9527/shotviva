'use client'

import { useTranslations } from 'next-intl'

import { ActionBar, ActionNotice } from '@/core/app-shell'
import { Link } from '@/core/i18n/ui'
import { buttonVariants } from '@/core/ui/button'

type Props = {
  // Where sign-up comes back to: this page with the panel open on the template (panel-request.ts).
  next: string
  // "3 free Standard images", from site.config through the page (G3).
  gift: string
}

// Signed out, the panel's primary (Owner 2026-11-25): everything above it can be looked at and
// chosen, and this goes to sign-up instead of charging. Nothing is uploaded or kept: after sign-up
// the panel reopens on the same template, without the photo.
export function GuestBar({ next, gift }: Props) {
  const t = useTranslations('home.generator')
  return (
    <ActionBar inline>
      <ActionNotice>{gift}</ActionNotice>
      <Link href={`/signup?${new URLSearchParams({ next })}`} prefetch={false} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
        <span>{t('panelSignUp')}</span>
      </Link>
    </ActionBar>
  )
}
