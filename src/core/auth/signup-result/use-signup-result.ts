'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export type SignupResult = { credits: number; pool: 'paid' | 'free' | null; percent: number | null }

function validPercent(value: number | null) {
  return value === null || (Number.isInteger(value) && value >= 1 && value <= 90)
}

export function parseSignupResult(raw: string): SignupResult | null {
  try {
    const result = JSON.parse(decodeURIComponent(raw)) as SignupResult
    if (!Number.isSafeInteger(result.credits) || result.credits < 0 || !['free','paid',null].includes(result.pool)) return null
    if (!validPercent(result.percent)) return null
    return result.credits || result.percent ? result : null
  } catch {
    return null
  }
}

// Verification returns to whichever local page started auth. The small display-only cookie
// holds the awarded effects. Read and remove it on landing without making public pages dynamic.
export function useSignupResult() {
  const pathname = usePathname()
  const [notice, setNotice] = useState<SignupResult | null>(null)
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout>
    const read = setTimeout(() => {
      const raw = document.cookie.split('; ').find(item => item.startsWith('sv_code_result='))
      if (!raw) { setNotice(null); return }
      document.cookie = 'sv_code_result=; Path=/; Max-Age=0; SameSite=Lax; Secure'
      setNotice(parseSignupResult(raw.slice('sv_code_result='.length)))
      hide = setTimeout(() => setNotice(null), 8000)
    }, 0)
    return () => { clearTimeout(read); clearTimeout(hide) }
  }, [pathname])
  return { notice, dismiss: () => setNotice(null) }
}
