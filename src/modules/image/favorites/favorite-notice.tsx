'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { FAVORITES_MAX } from '@/core/favorites/limits'

import type { FavoriteFailure } from './favorites-store'

const SHOW_MS = 6000

// Why a heart went back (the save was refused): the cap, a template that is not live, or anything
// else as a retry. The same top toast as Photos' "Photo deleted." (DESIGN §8.4): it never covers
// the bottom bar, closes itself, and is read out once.
export function FavoriteNotice({ failure, onClose }: { failure: FavoriteFailure | null; onClose(): void }) {
  const t = useTranslations('app.favorites')
  useEffect(() => {
    if (!failure) return
    const timer = setTimeout(onClose, SHOW_MS)
    return () => clearTimeout(timer)
  }, [failure, onClose])
  return (
    <div role="status" className="pointer-events-none fixed top-[calc(var(--sat)+12px)] left-1/2 z-[120] w-[min(calc(100vw-2*var(--gutter)),480px)] -translate-x-1/2">
      {failure ? (
        <div className="hairline shadow-sheet pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-popover py-3 pr-3 pl-3.5 text-body leading-[1.4]">
          <p className="min-w-0 flex-1">{failure === 'limit' ? t('limit', { max: FAVORITES_MAX }) : t(failure)}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="-my-1.5 -mr-1 grid size-11 flex-none place-items-center rounded-full text-bone-dim hover:bg-wash hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  )
}
