'use client'

import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import type { MembershipTier } from '@/core/config'

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

// The tutorial in Batch create's top bar (Owner 2026-11-12): always there while the page is
// open, a "?" on phones and "Tutorial" beside it from md. It never opens by itself; until it
// has been opened once in this browser it carries a small dot.
export function GuideButton({ tier }: { tier: MembershipTier | null }) {
  const t = useTranslations('app.gated.guide')
  // The server and the first client render agree on "seen" (no dot), then the browser's answer.
  const seen = useSyncExternalStore(subscribe, readSeen, () => true)
  return (
    <IntroTrigger
      tab="batch"
      tier={tier}
      label={t('open')}
      onOpen={markSeen}
      className="press relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full text-label font-semibold text-bone-dim hover:text-foreground md:px-2"
    >
      <GuideIcon />
      <span aria-hidden="true" className="hidden md:inline">
        {t('title')}
      </span>
      {seen ? null : <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-primary md:right-1" />}
    </IntroTrigger>
  )
}

// A question mark in a circle, in the house stroke.
export function GuideIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" />
      <path d="M12 17h.01" />
    </svg>
  )
}
