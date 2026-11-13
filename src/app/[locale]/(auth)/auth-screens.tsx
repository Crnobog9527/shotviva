'use client'

import { useSearchParams } from 'next/navigation'
import type { ComponentProps } from 'react'

import { loginNotice } from '@/core/auth/guest-gate'
import { nextIn } from '@/core/auth/redirect-target'
import { LoginForm, ResetRequestForm, SignupForm } from '@/core/auth/ui'
import type { Locale } from '@/core/i18n'

import { Arrived } from './arrived'
import { inMainlandZone } from './mainland-zone'

// The parts of the sign-in pages that depend on the address (?next=, ?error=, ?via=), read in the
// browser so the pages themselves stay static: the form is in the cached HTML (the page's
// Suspense fallback, rendered with the defaults) and shows at once, instead of waiting for a
// render in the US region (2026-11-13: several seconds on mainland phones). A signed-in visitor
// never gets here (the proxy sends them on, core/auth/guest-gate.ts).
type Shared = { locale: Locale; connectPath: string }
type LoginProps = Omit<ComponentProps<typeof LoginForm>, 'next' | 'notice' | 'arrived'> & Shared
type SignupProps = Omit<ComponentProps<typeof SignupForm>, 'next' | 'arrived' | 'initialTab'> & Shared
type ResetProps = Omit<ComponentProps<typeof ResetRequestForm>, 'linkExpired'>

export function LoginScreen({ locale, connectPath, google, ...form }: LoginProps) {
  const params = useSearchParams()
  const next = nextIn(params.get('next'), locale)
  return (
    <LoginForm
      {...form}
      google={{ ...google, mainlandNote: google.mainlandNote || inMainlandZone() }}
      next={next}
      notice={loginNotice(params.get('error'))}
      arrived={<Arrived next={next} page="login" connectPath={connectPath} />}
    />
  )
}

export function SignupScreen({ locale, connectPath, google, ...form }: SignupProps) {
  const params = useSearchParams()
  const next = nextIn(params.get('next'), locale)
  return (
    <SignupForm
      {...form}
      google={{ ...google, mainlandNote: google.mainlandNote || inMainlandZone() }}
      next={next}
      arrived={<Arrived next={next} page="signup" connectPath={connectPath} />}
      initialTab={params.get('via') === 'email' ? 'email' : 'phone'}
    />
  )
}

export function ResetScreen(props: ResetProps) {
  const params = useSearchParams()
  return <ResetRequestForm {...props} linkExpired={params.get('error') === 'link_expired'} />
}
