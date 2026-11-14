'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

const SHOW_MS = 6000

// "Photo deleted." after deleting a work (T41): a toast from the top that never covers the
// bottom bar (DESIGN §8.4, B comp studio.css .toast), closes itself, and takes ?deleted off the
// address so a reload does not show it again.
export function DeletedToast() {
  const t = useTranslations('app.photos')
  const [open, setOpen] = useState(true)
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('deleted')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    const timer = setTimeout(() => setOpen(false), SHOW_MS)
    return () => clearTimeout(timer)
  }, [])
  if (!open) return null
  return (
    <div
      role="status"
      className="hairline shadow-sheet fixed top-[calc(var(--sat)+12px)] left-1/2 z-[120] flex w-[min(calc(100vw-2*var(--gutter)),480px)] -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-popover py-3 pr-3 pl-3.5 text-body leading-[1.4]"
    >
      <p className="min-w-0 flex-1">{t('deleted')}</p>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t('deletedClose')}
        className="-my-1.5 -mr-1 grid size-9 flex-none place-items-center rounded-full text-bone-dim hover:bg-wash hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </div>
  )
}
