'use client'

import { useTranslations } from 'next-intl'

import { useShareSelect } from './select-context'

// Next to "Done": starts select mode, or leaves it.
export function ShareToggle() {
  const select = useShareSelect()
  const t = useTranslations('app.workShare')
  if (!select) return null
  return (
    <button
      type="button"
      onClick={select.selecting ? select.stop : select.start}
      aria-label={select.selecting ? undefined : t('startAria')}
      className="press hairline inline-flex min-h-9 items-center rounded-full bg-wash px-4 text-caption font-medium text-foreground"
    >
      {select.selecting ? t('cancel') : t('start')}
    </button>
  )
}
