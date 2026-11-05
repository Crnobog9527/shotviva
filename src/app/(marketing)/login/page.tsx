import { Suspense } from 'react'

import { LoginForm } from '@/core/auth/ui'
import { sanitizeNext } from '@/core/auth'

import { googleAction, loginAction } from '../../auth/actions'

const NOTICES = new Set(['unverified', 'link_expired', 'callback_failed', 'oauth_failed'])

async function Login({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const error = typeof params.error === 'string' && NOTICES.has(params.error) ? params.error : null
  const next = sanitizeNext(typeof params.next === 'string' ? params.next : null)
  return <LoginForm action={loginAction} googleAction={googleAction} next={next} notice={error} />
}

export default function LoginPage(props: PageProps<'/login'>) {
  return (
    <Suspense>
      <Login {...props} />
    </Suspense>
  )
}
