'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState, type ComponentProps, type ReactNode } from 'react'

import { loginNotice } from '@/core/auth/guest-gate'
import { nextIn } from '@/core/auth/redirect-target'
import { LoginForm, ResetRequestForm, SignupForm } from '@/core/auth/ui'
import type { Locale } from '@/core/i18n'

import { Arrived } from './arrived'

// The parts of the sign-in pages that depend on the address (?next=, ?error=, ?via=), read in the
// browser so the pages themselves stay static (no render in the US region before the form shows,
// 2026-11-13: several seconds on mainland phones). A signed-in visitor never gets here (the proxy
// sends them on, core/auth/guest-gate.ts).
//
// The form is rendered with the defaults on the server and again at hydration, so React keeps the
// server's DOM: only ParamsReader, in its own Suspense, waits for the browser to read the address
// and hands it up. The form used to be the Suspense fallback, replaced wholesale by a browser-only
// render after hydration; once /login became fully static (#625) that replacement painted the
// form's largest line again, slightly wider in the loaded font, and Chrome took it as a new LCP
// (mobile, throttled: 1.3 s -> 3.4 s). The forms keep some address values in state (the open tab,
// the expired-link notice), so each is keyed on them: only a value that differs from the default
// remounts the form, once.
type Shared = { locale: Locale; connectPath: string }
type LoginProps = Omit<ComponentProps<typeof LoginForm>, 'next' | 'notice' | 'arrived'> & Shared
type SignupProps = Omit<ComponentProps<typeof SignupForm>, 'next' | 'arrived' | 'initialTab'> & Shared
type ResetProps = Omit<ComponentProps<typeof ResetRequestForm>, 'linkExpired'>

type Read = (name: string) => string | null

function ParamsReader({ onRead }: { onRead: (params: URLSearchParams) => void }) {
  const params = useSearchParams()
  useEffect(() => onRead(new URLSearchParams(params.toString())), [params, onRead])
  return null
}

// The address's query once the browser has read it (null before: the server's defaults), and the
// reader to render next to the form.
function useAddress(): [Read, ReactNode] {
  const [params, setParams] = useState<URLSearchParams | null>(null)
  const reader = (
    <Suspense fallback={null}>
      <ParamsReader onRead={setParams} />
    </Suspense>
  )
  return [(name) => params?.get(name) ?? null, reader]
}

export function LoginScreen({ locale, connectPath, google, ...form }: LoginProps) {
  const [param, reader] = useAddress()
  const next = nextIn(param('next'), locale)
  const notice = loginNotice(param('error'))
  return (
    <>
      {reader}
      <LoginForm
        key={notice ?? ''}
        {...form}
        google={google}
        next={next}
        notice={notice}
        arrived={<Arrived next={next} page="login" connectPath={connectPath} />}
      />
    </>
  )
}

export function SignupScreen({ locale, connectPath, google, ...form }: SignupProps) {
  const [param, reader] = useAddress()
  const next = nextIn(param('next'), locale)
  const tab = param('via') === 'email' ? 'email' : 'phone'
  return (
    <>
      {reader}
      <SignupForm
        key={tab}
        {...form}
        google={google}
        next={next}
        arrived={<Arrived next={next} page="signup" connectPath={connectPath} />}
        initialTab={tab}
      />
    </>
  )
}

export function ResetScreen(props: ResetProps) {
  const [param, reader] = useAddress()
  const expired = param('error') === 'link_expired'
  return (
    <>
      {reader}
      <ResetRequestForm key={String(expired)} {...props} linkExpired={expired} />
    </>
  )
}
