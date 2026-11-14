import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { SignupCodeProvider } from '@/core/auth/ui'
import { currentLocale } from '@/core/i18n/server'
import { CONNECT_PAGE_PATH } from '@/core/partner'
import { site } from '@/site/site.config'

import { googleAction, phoneSendAction, phoneVerifyAction, resendSignupAction, signupAction } from '@/app/auth/actions'

import { SignupScreen } from '../auth-screens'
import { sender } from '../sender'

// Mainland phone sign-in is offered on the Chinese pages only (ARCHITECTURE §7, T63).
const phone = { send: phoneSendAction, verify: phoneVerifyAction }

// Sign-in pages are noindex like the rest of the app (建站规格 R6), in both languages, and carry
// no hreflang (ARCHITECTURE §17); the root template adds " | Shotviva" to the title.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.signup'))('title') }
}

// Static, like the login page (auth-screens.tsx): the browser fills in ?next= and ?via=, and the
// invite-code cookie is read after the form shows (SignupCodeProvider without `initial`). A
// signed-in visitor is redirected by the proxy (core/auth/guest-gate.ts).
export default async function SignupPage() {
  const locale = await currentLocale()
  const form = {
    action: signupAction,
    google: { action: googleAction, mainlandNote: locale === 'zh' || ('zone' as const) },
    resendAction: resendSignupAction,
    giftCredits: site.billing.freeCredits,
    sender,
    phone: locale === 'zh' ? phone : undefined,
  }
  return (
    <SignupCodeProvider>
      <SignupScreen {...form} locale={locale} connectPath={CONNECT_PAGE_PATH} />
    </SignupCodeProvider>
  )
}
