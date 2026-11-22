'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import { useShareSelection } from './share-selection'

// "Share templates" beside Create's search: turns share mode on (and off again).
export function ShareModeButton({ className }: { className?: string }) {
  const t = useTranslations('app.templateShare')
  const selection = useShareSelection()
  if (!selection) return null
  const on = selection.selecting
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={on ? selection.stop : selection.start}
      className={cn(
        'press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-caption font-medium',
        on ? 'bg-foreground text-background' : 'hairline bg-wash text-foreground hover:bg-wash-strong',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
      {on ? t('modeOn') : (
        <>
          {/* A short word on phones, so the search box keeps its room at 375 px. */}
          <span className="md:hidden">{t('modeOffShort')}</span>
          <span className="max-md:hidden">{t('modeOff')}</span>
        </>
      )}
    </button>
  )
}
