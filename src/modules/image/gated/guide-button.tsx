'use client'

import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import type { MembershipTier } from '@/core/config'
import { cn } from '@/core/ui/cn'

import { IntroTrigger } from './intro-trigger'

// "Seen the tutorial" lives in this browser only: a per-viewer convenience, never needed for
// anything to work. Storage can be missing or throw (private windows); then the dot just shows.
const SEEN_KEY = 'shotviva.batch-guide.seen'
const listeners = new Set<() => void>()

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Nothing to keep; the dot stays for this visit's next render only.
  }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// "See how it works" (Owner 2026-11-12: the small "?" was easy to miss): always a play mark and
// the words, never an icon alone. `pill` is the big guided entry in Batch create's head; `chip`
// the compact one (the Create card, the /generate/batch page's bar). It never opens by itself;
// until it has been opened once in this browser the pill carries a small dot.
export function GuideButton({ tier, variant = 'chip', className }: { tier: MembershipTier | null; variant?: 'pill' | 'chip'; className?: string }) {
  const t = useTranslations('app.gated.guide')
  // The server and the first client render agree on "seen" (no dot), then the browser's answer.
  const seen = useSyncExternalStore(subscribe, readSeen, () => true)
  const pill = variant === 'pill'
  return (
    <IntroTrigger
      tab="batch"
      tier={tier}
      onOpen={markSeen}
      className={cn(
        'press relative inline-flex flex-none items-center rounded-full font-semibold text-foreground',
        pill ? 'min-h-12 gap-2.5 bg-wash-strong pr-5 pl-1.5 text-label' : 'min-h-11 gap-2 bg-wash pr-3.5 pl-1 text-caption',
        className,
      )}
    >
      <PlayMark large={pill} />
      {t('demo')}
      {pill && !seen ? <span aria-hidden="true" className="absolute top-1 right-1 size-2.5 rounded-full bg-primary shadow-[0_0_0_2px_var(--popover)]" /> : null}
    </IntroTrigger>
  )
}

// A play triangle on the safelight disc.
function PlayMark({ large }: { large: boolean }) {
  return (
    <span aria-hidden="true" className={cn('grid flex-none place-items-center rounded-full bg-primary text-primary-foreground', large ? 'size-9' : 'size-8')}>
      <svg viewBox="0 0 24 24" className={large ? 'size-4' : 'size-3.5'} fill="currentColor">
        <path d="M8 5.5v13l10.5-6.5z" />
      </svg>
    </span>
  )
}
