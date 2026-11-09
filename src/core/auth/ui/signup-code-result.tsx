'use client'

import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { percentZh } from '../../codes'

type Result = { credits: number; pool: 'paid' | 'free' | null; percent: number | null }

function validPercent(value: number | null) {
  return value === null || (Number.isInteger(value) && value >= 1 && value <= 90)
}

export function parseSignupResult(raw: string): Result | null {
  try {
    const result = JSON.parse(decodeURIComponent(raw)) as Result
    if (!Number.isSafeInteger(result.credits) || result.credits < 0 || !['free','paid',null].includes(result.pool)) return null
    if (!validPercent(result.percent)) return null
    return result.credits || result.percent ? result : null
  } catch {
    return null
  }
}

// Verification returns to whichever local page started auth. The small display-only cookie
// holds the awarded effects. Read and remove it on landing without making public pages dynamic.
export function SignupCodeResult() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('app.signupCodes')
  const [notice, setNotice] = useState<Result | null>(null)
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
  if (!notice) return null
  return (
    <div role="status" className="hairline shadow-sheet fixed top-[calc(var(--sat)+12px)] left-1/2 z-[120] flex w-[min(calc(100vw-2*var(--gutter)),480px)] -translate-x-1/2 items-center gap-2 rounded-2xl bg-popover py-2 pr-2 pl-4">
      <div className="flex-1 text-sm">
        {notice.credits > 0 && <p>{t('received', { credits: notice.credits, pool: notice.pool ?? 'free' })}</p>}
        {notice.percent && <p>{t('saved', { percent: locale === 'zh' ? percentZh(notice.percent) : notice.percent })}</p>}
      </div>
      <button type="button" className="min-h-11 min-w-11 text-xl text-muted-foreground" aria-label={t('dismiss')} onClick={() => setNotice(null)}>×</button>
    </div>
  )
}
