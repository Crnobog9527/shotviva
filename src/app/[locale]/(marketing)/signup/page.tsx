import { Suspense } from 'react'

import { nextIn } from '@/core/auth'
import { currentLocale } from '@/core/i18n/server'
import { SignupForm } from '@/core/auth/ui'
import { freeStandardImages } from '@/site/content'

import { googleAction, signupAction } from '@/app/auth/actions'

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
