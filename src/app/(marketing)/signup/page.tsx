import { Suspense } from 'react'

import { sanitizeNext } from '@/core/auth'
import { SignupForm } from '@/core/auth/ui'
import { freeStandardImages } from '@/site/content'

import { googleAction, signupAction } from '../../auth/actions'

async function Signup({ searchParams }: PageProps<'/signup'>) {
  const params = await searchParams
  const next = sanitizeNext(typeof params.next === 'string' ? params.next : null)
  return (
    <SignupForm action={signupAction} googleAction={googleAction} next={next} freeImages={freeStandardImages} />
  )
}

export default function SignupPage(props: PageProps<'/signup'>) {
  return (
    <Suspense>
      <Signup {...props} />
    </Suspense>
  )
}
