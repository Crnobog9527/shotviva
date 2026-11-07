'use client'

import { useTranslations } from 'next-intl'

import { EmptyState, STATE_GHOST } from '../../ui/empty-state'

// While a dialog view reads: three quiet ticket-row shapes, so the panel keeps its layout.
export function HelpLoading() {
  const t = useTranslations('app.support')
  return (
    <div role="status" className="grid gap-px overflow-hidden rounded-panel pt-5">
      <span className="sr-only">{t('loading')}</span>
      {[0, 1, 2].map((row) => (
        <span key={row} aria-hidden="true" className="block h-16 animate-pulse bg-wash-faint motion-reduce:animate-none" />
      ))}
    </div>
  )
}

// A read that failed (offline, a server error): one line and Try again (empty.html error state).
export function HelpLoadFailed({ retry }: { retry(): void }) {
  const t = useTranslations('app.support')
  return (
    <EmptyState
      tone="error"
      icon="error"
      title={t('loadError')}
      body={t('loadErrorBody')}
      action={
        <button type="button" onClick={retry} className={STATE_GHOST}>
          {t('retry')}
        </button>
      }
      className="mx-0 md:mx-0"
    />
  )
}
