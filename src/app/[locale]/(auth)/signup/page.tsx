import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { nextIn } from '@/core/auth'
import { SignupForm } from '@/core/auth/ui'
import { currentLocale } from '@/core/i18n/server'
import { freeStandardImages } from '@/site/content'

import { googleAction, resendSignupAction, signupAction } from '@/app/auth/actions'

import { Arrived } from '../arrived'
import { redirectIfSignedIn } from '../signed-in-redirect'
import { sender } from '../sender'

// Sign-in pages are noindex like the rest of the app (建站规格 R6), in both languages, and carry
// no hreflang (ARCHITECTURE §17); the root template adds " | Shotviva" to the title.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.signup'))('title') }
}

async function Signup({ searchParams }: PageProps<'/[locale]/signup'>) {
  const params = await searchParams
  const rawNext = typeof params.next === 'string' ? params.next : null
  const locale = await currentLocale()
  await redirectIfSignedIn(rawNext, locale)
  const next = nextIn(rawNext, locale)
  return (
    <SignupForm
      action={signupAction}
      googleAction={googleAction}
      resendAction={resendSignupAction}
      next={next}
      freeImages={freeStandardImages}
      arrived={<Arrived next={next} page="signup" />}
      sender={sender}
    />
  )
}

export default function SignupPage(props: PageProps<'/[locale]/signup'>) {
  return (
    <Suspense>
      <Signup {...props} />
    </Suspense>
  )
}
