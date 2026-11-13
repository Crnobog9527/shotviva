'use client'

import { useLocale, useTranslations } from 'next-intl'

import { GoogleButton, SignupCodeField, SignupCodeProvider, useSignupCodeDraft, saveSignupCode, type FormAction } from '@/core/auth/ui'
import { useRouter } from '@/core/i18n/navigation'
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
      {open && <SignupCodeProvider><SheetActions googleAction={googleAction} next={next} /></SignupCodeProvider>}
      <p className="mk-signup-fine">
        {t.rich('fine', {
          terms: (chunks) => <Link href="/terms">{chunks}</Link>,
          privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
        })}
      </p>
    </ResponsiveSheet>
  )
}

function SheetActions({ googleAction, next }: Pick<Props, 'googleAction' | 'next'>) {
  const t = useTranslations('home.generator.signup')
  const draft = useSignupCodeDraft()
  const router = useRouter()
  // Mainland phone sign-in on the Chinese pages only, as on /signup and /login (ARCHITECTURE §7,
  // T63). /signup opens on its 手机号 tab there, so 用邮箱继续 asks for the 邮箱 tab.
  const phone = useLocale() === 'zh'
  // Keep invite codes out of link hrefs (autocapture and replay can see those). An edited
  // field, including a cleared one, reaches the next form before its request reads cookies.
  function link(path: string, extra?: Record<string, string>) {
    const href = `${path}?${new URLSearchParams({ next, ...extra })}`
    return { href, onNavigate(event: { preventDefault(): void }) {
      if (!draft?.edited) return
      event.preventDefault()
      void saveSignupCode(draft.value).catch(() => {}).then(() => router.push(href))
    } }
  }
  return (
    <>
      <SignupCodeField />
      <GoogleButton action={googleAction} next={next} className="mk-cta h-auto rounded-tile border-0" />
      <div className="mk-alt">
        {phone ? <Link className="mk-ghost-btn" prefetch={false} {...link('/signup')}>{t('phone')}</Link> : null}
        <Link className="mk-ghost-btn" prefetch={false} {...link('/signup', phone ? { via: 'email' } : undefined)}>{t('email')}</Link>
        <Link className="mk-ghost-btn" prefetch={false} {...link('/login')}>{t('login')}</Link>
      </div>
    </>
  )
}
