'use client'

import { useLocale, useTranslations } from 'next-intl'

import { percentZh } from '../../codes'
import type { SignupResult } from './use-signup-result'

export default function SignupCodeNotice({ notice, dismiss }: { notice: SignupResult; dismiss(): void }) {
  const locale = useLocale()
  const t = useTranslations('app.signupCodes')
  return (
    <div role="status" className="hairline shadow-sheet fixed top-[calc(var(--sat)+12px)] left-1/2 z-[120] flex w-[min(calc(100vw-2*var(--gutter)),480px)] -translate-x-1/2 items-center gap-2 rounded-2xl bg-popover py-2 pr-2 pl-4">
      <div className="flex-1 text-sm">
        {notice.credits > 0 && <p>{t('received', { credits: notice.credits, pool: notice.pool ?? 'free' })}</p>}
        {notice.percent && <p>{t('saved', { percent: locale === 'zh' ? percentZh(notice.percent) : notice.percent })}</p>}
      </div>
      <button type="button" className="min-h-11 min-w-11 text-xl text-muted-foreground" aria-label={t('dismiss')} onClick={dismiss}>×</button>
    </div>
  )
}
