'use client'

import { useTranslations } from 'next-intl'
import { createContext, useContext, type ReactNode } from 'react'

import { Link } from '../i18n/ui'
import { cn } from '../ui/cn'

const Brand = createContext<string | null>(null)

// The (app) layout passes the brand name from site.config once; core cannot read site/.
export function BrandProvider({ name, children }: { name: string; children: ReactNode }) {
  return <Brand.Provider value={name}>{children}</Brand.Provider>
}

// The small "Shotviva." wordmark of the signed-in pages (DESIGN §6.9 item 7, §8.2, spec #199):
// the marketing wordmark's type with the safelight period, without the "AI photo studio"
// subtitle, linking to the landing page in the page's language (/ or /zh). Far left of the
// desktop top bar; top left of the phone tab-root headers. Flow pages keep their Back link.
export function Wordmark({ className }: { className?: string }) {
  const name = useContext(Brand)
  const t = useTranslations('app.tabs')
  if (!name) return null
  return (
    <Link
      href="/"
      data-wordmark=""
      aria-label={t('home', { brand: name })}
      className={cn('press inline-flex min-h-11 items-center font-display text-[24px] leading-none tracking-[-0.02em] text-foreground', className)}
    >
      {name}
      <span aria-hidden="true" className="text-primary">
        .
      </span>
    </Link>
  )
}
