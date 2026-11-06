import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { nextIn } from '@/core/auth'
import { currentLocale } from '@/core/i18n/server'
import { SignupForm } from '@/core/auth/ui'
import { freeStandardImages } from '@/site/content'

import { googleAction, signupAction } from '@/app/auth/actions'

// Sign-in pages are noindex like the rest of the app (建站规格 R6); the root template adds
// " | Shotviva" to the title.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.signup'))('title') }
}

async function Signup({ searchParams }: PageProps<'/[locale]/signup'>) {
  const params = await searchParams
  const next = nextIn(typeof params.next === 'string' ? params.next : null, await currentLocale())
  return (
    <SignupForm action={signupAction} googleAction={googleAction} next={next} freeImages={freeStandardImages} />
  )
}

export default function SignupPage(props: PageProps<'/[locale]/signup'>) {
  return (
    <Suspense>
      <Signup {...props} />
    </Suspense>
  )
}
