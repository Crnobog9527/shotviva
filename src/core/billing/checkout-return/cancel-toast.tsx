'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

const SHOW_MS = 10_000

// Stripe's cancel_url is /pricing?checkout=cancel (T43, comps-v3-b pricing.html): one toast
// from the top, nothing else on the page changes. The page is static, so the address is read
// after hydration; the parameter is then taken off so a reload does not show it again.
export function CheckoutCancelToast() {
  const t = useTranslations('paywall')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('checkout') !== 'cancel') return
    url.searchParams.delete('checkout')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    // A frame later, so the toast drops in instead of appearing (DESIGN §8.4).
    const show = requestAnimationFrame(() => setOpen(true))
    const hide = setTimeout(() => setOpen(false), SHOW_MS)
    return () => {
      cancelAnimationFrame(show)
      clearTimeout(hide)
    }
  }, [])
  if (!open) return null
  return (
    <div
      role="status"
      className="hairline shadow-sheet fixed top-[calc(var(--sat)+12px)] left-1/2 z-[120] flex w-[min(calc(100vw-2*var(--gutter)),480px)] -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-popover py-3 pr-3 pl-3.5 text-label leading-[1.4] motion-safe:animate-[sv-toast-in_350ms_var(--ease)]"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] flex-none text-bone-dim" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <p className="min-w-0 flex-1">{t.rich('cancelled', { b: (chunks) => <b className="font-medium">{chunks}</b> })}</p>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t('cancelledClose')}
        className="-my-1.5 -mr-1 grid size-9 flex-none place-items-center rounded-full text-bone-dim hover:bg-wash hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </div>
  )
}
