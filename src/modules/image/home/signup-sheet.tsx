'use client'

import { useTranslations } from 'next-intl'

import { GoogleButton, type FormAction } from '@/core/auth/ui'
import { Link } from '@/core/i18n/ui'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { GiftIcon } from './home-icons'

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  googleAction: FormAction
  // Where sign-in lands: this home page, where the generator brings the draft back.
  next: string
  // "3 free Standard images", from site.config through the page.
  gift: string
}

// Signed out, Generate opens this instead of charging (DESIGN §6.9 item 9). The photo,
// template, size and note were saved in this browser just before (home-draft.ts); after sign-up
// or log-in the visitor lands back here with them and presses Generate once more.
export function SignupSheet({ open, onOpenChange, googleAction, next, gift }: Props) {
  const t = useTranslations('home.generator.signup')
  const back = `?next=${encodeURIComponent(next)}`
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('title')} description={t('text')}>
      <div className="mk-gift-box">
        <span className="mk-gift-ico">
          <GiftIcon className="size-5" />
        </span>
        <span>
          <b>{gift}</b>
          <span>{t('giftNote')}</span>
        </span>
      </div>
      <GoogleButton action={googleAction} next={next} className="mk-cta h-auto rounded-tile border-0" />
      <div className="mk-alt">
        <Link className="mk-ghost-btn" href={`/signup${back}`}>
          {t('email')}
        </Link>
        <Link className="mk-ghost-btn" href={`/login${back}`}>
          {t('login')}
        </Link>
      </div>
      <p className="mk-signup-fine">
        {t.rich('fine', {
          terms: (chunks) => <Link href="/terms">{chunks}</Link>,
          privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
        })}
      </p>
    </ResponsiveSheet>
  )
}
