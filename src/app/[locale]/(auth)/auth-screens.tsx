'use client'

import { useSearchParams } from 'next/navigation'
import type { ComponentProps } from 'react'

import { loginNotice } from '@/core/auth/guest-gate'
import { inMainlandZone } from '@/core/auth/mainland-zone'
import { nextIn } from '@/core/auth/redirect-target'
import { LoginForm, ResetRequestForm, SignupForm } from '@/core/auth/ui'
import type { Locale } from '@/core/i18n'

import { Arrived } from './arrived'

// The parts of the sign-in pages that depend on the address (?next=, ?error=, ?via=), read in the
// browser so the pages themselves stay static: the form is in the cached HTML (the page's
// Suspense fallback, rendered with the defaults) and shows at once, instead of waiting for a
// render in the US region (2026-11-13: several seconds on mainland phones). A signed-in visitor
// never gets here (the proxy sends them on, core/auth/guest-gate.ts). The forms keep some of these
// values in state (the open tab, the expired-link notice), so each is keyed on them: a value that
// differs from the default remounts the form once, at hydration.
type Shared = { locale: Locale; connectPath: string }
type LoginProps = Omit<ComponentProps<typeof LoginForm>, 'next' | 'notice' | 'arrived'> & Shared
type SignupProps = Omit<ComponentProps<typeof SignupForm>, 'next' | 'arrived' | 'initialTab'> & Shared
type ResetProps = Omit<ComponentProps<typeof ResetRequestForm>, 'linkExpired'>

export function LoginScreen({ locale, connectPath, google, ...form }: LoginProps) {
  const params = useSearchParams()
  const next = nextIn(params.get('next'), locale)
  const notice = loginNotice(params.get('error'))
  return (
    <LoginForm
      key={notice ?? ''}
      {...form}
      google={{ ...google, mainlandNote: google.mainlandNote || inMainlandZone() }}
      next={next}
      notice={notice}
      arrived={<Arrived next={next} page="login" connectPath={connectPath} />}
    />
  )
}

export function SignupScreen({ locale, connectPath, google, ...form }: SignupProps) {
  const params = useSearchParams()
  const next = nextIn(params.get('next'), locale)
  const tab = params.get('via') === 'email' ? 'email' : 'phone'
  return (
    <SignupForm
      key={tab}
      {...form}
      google={{ ...google, mainlandNote: google.mainlandNote || inMainlandZone() }}
      next={next}
      arrived={<Arrived next={next} page="signup" connectPath={connectPath} />}
      initialTab={tab}
    />
  )
}

export function ResetScreen(props: ResetProps) {
  const params = useSearchParams()
  const expired = params.get('error') === 'link_expired'
  return <ResetRequestForm key={String(expired)} {...props} linkExpired={expired} />
}
