import { Suspense } from 'react'

import { LoginForm } from '@/core/auth/ui'
import { nextIn } from '@/core/auth'
import { currentLocale } from '@/core/i18n/server'

import { googleAction, loginAction } from '@/app/auth/actions'

const NOTICES = new Set(['unverified', 'link_expired', 'callback_failed', 'oauth_failed'])

async function Login({ searchParams }: PageProps<'/[locale]/login'>) {
  const params = await searchParams
  const error = typeof params.error === 'string' && NOTICES.has(params.error) ? params.error : null
  const next = nextIn(typeof params.next === 'string' ? params.next : null, await currentLocale())
  return <LoginForm action={loginAction} googleAction={googleAction} next={next} notice={error} />
}

export default function LoginPage(props: PageProps<'/[locale]/login'>) {
  return (
    <Suspense>
      <Login {...props} />
    </Suspense>
  )
}
