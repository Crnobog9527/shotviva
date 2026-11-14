'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { askNotify, canAskNotify, notifyGranted } from './browser-notify'

// "Notify me when it's done" on a wait screen: the only place the browser's permission prompt
// is ever raised, by the user's own press after starting a job. Hidden where the browser cannot
// show one (phones) or the user already answered; once granted it says so.
export function NotifyButton() {
  const t = useTranslations('app.notify')
  const [state, setState] = useState<'hidden' | 'ask' | 'granted'>('hidden')
  useEffect(() => {
    // After hydration: the permission is the browser's, unknown to the server render.
    const frame = requestAnimationFrame(() => setState(canAskNotify() ? 'ask' : 'hidden'))
    return () => cancelAnimationFrame(frame)
  }, [])
  if (state === 'hidden') return null
  if (state === 'granted') return <p className="mt-2 text-caption text-bone-dim">{t('asked')}</p>
  return (
    <button
      type="button"
      onClick={() => void askNotify().then((granted) => setState(granted || notifyGranted() ? 'granted' : 'hidden'))}
      className="press hairline mt-3 inline-flex min-h-9 items-center gap-2 rounded-full bg-wash px-3 text-caption font-semibold"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
      </svg>
      {t('ask')}
    </button>
  )
}
