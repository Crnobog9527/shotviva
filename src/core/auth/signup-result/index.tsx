'use client'

import dynamic from 'next/dynamic'

import { useSignupResult } from './use-signup-result'

const Notice = dynamic(() => import('./signup-code-notice'), { ssr: false })

export function SignupCodeResult() {
  const { notice, dismiss } = useSignupResult()
  return notice ? <Notice notice={notice} dismiss={dismiss} /> : null
}
