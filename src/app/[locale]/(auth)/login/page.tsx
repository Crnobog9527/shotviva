import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { nextIn } from '@/core/auth'
import { LoginForm } from '@/core/auth/ui'
import { currentLocale } from '@/core/i18n/server'
import { CONNECT_PAGE_PATH } from '@/core/partner'

import { googleAction, loginAction, phoneSendAction, phoneVerifyAction, resendSignupAction } from '@/app/auth/actions'

import { LoginScreen } from '../auth-screens'
import { sender } from '../sender'

// Mainland phone sign-in is offered on the Chinese pages only (ARCHITECTURE §7, T63).
const phone = { send: phoneSendAction, verify: phoneVerifyAction }

// Sign-in pages are noindex like the rest of the app (建站规格 R6), in both languages, and carry
// no hreflang (ARCHITECTURE §17); the root template adds " | Shotviva" to the title.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.login'))('title') }
}

// Static (auth-screens.tsx): the cached HTML carries the form with the defaults (no notice, the
// account page as `next`); the browser then fills in ?next= and ?error=. A signed-in visitor is
// redirected by the proxy (core/auth/guest-gate.ts).
export default async function LoginPage() {
  const locale = await currentLocale()
  const form = {
    action: loginAction,
    google: { action: googleAction, mainlandNote: locale === 'zh' || ('zone' as const) },
    resendAction: resendSignupAction,
    sender,
    phone: locale === 'zh' ? phone : undefined,
  }
  return (
    <Suspense fallback={<LoginForm {...form} next={nextIn(null, locale)} notice={null} />}>
      <LoginScreen {...form} locale={locale} connectPath={CONNECT_PAGE_PATH} />
    </Suspense>
  )
}
