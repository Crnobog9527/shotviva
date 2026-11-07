import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { nextIn } from '@/core/auth'
import { LoginForm } from '@/core/auth/ui'
import { currentLocale } from '@/core/i18n/server'

import { googleAction, loginAction, phoneSendAction, phoneVerifyAction, resendSignupAction } from '@/app/auth/actions'

import { Arrived } from '../arrived'
import { redirectIfSignedIn } from '../signed-in-redirect'
import { sender } from '../sender'

// Mainland phone sign-in is offered on the Chinese pages only (ARCHITECTURE §7, T63).
const phone = { send: phoneSendAction, verify: phoneVerifyAction }

// Sign-in pages are noindex like the rest of the app (建站规格 R6), in both languages, and carry
// no hreflang (ARCHITECTURE §17); the root template adds " | Shotviva" to the title.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.login'))('title') }
}

const NOTICES = new Set(['unverified', 'link_expired', 'callback_failed', 'oauth_failed'])

async function Login({ searchParams }: PageProps<'/[locale]/login'>) {
  const params = await searchParams
  const error = typeof params.error === 'string' && NOTICES.has(params.error) ? params.error : null
  const rawNext = typeof params.next === 'string' ? params.next : null
  const locale = await currentLocale()
  // An unverified account is sent here with ?error=unverified; showing the form is the point.
  if (!error) await redirectIfSignedIn(rawNext, locale)
  const next = nextIn(rawNext, locale)
  return (
    <LoginForm
      action={loginAction}
      googleAction={googleAction}
      resendAction={resendSignupAction}
      next={next}
      notice={error}
      arrived={<Arrived next={next} page="login" />}
      sender={sender}
      phone={locale === 'zh' ? phone : undefined}
    />
  )
}

export default function LoginPage(props: PageProps<'/[locale]/login'>) {
  return (
    <Suspense>
      <Login {...props} />
    </Suspense>
  )
}
