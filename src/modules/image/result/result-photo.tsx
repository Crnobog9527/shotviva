/* eslint-disable @next/next/no-img-element -- auth-gated download route, not a static asset */
import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import type { CreditPool } from '@/core/billing/pools'

// The finished photo, full width at its own ratio, never cropped (DESIGN §4.4), with its
// pool's tag: free works are public with a watermark, paid works are private and clean.
export function ResultPhoto({ src, alt, pool, visibility }: { src: string; alt: string; pool: CreditPool | null; visibility?: 'public' | 'private' }) {
  return (
    <figure className="hairline relative overflow-hidden rounded-panel bg-photo-ground">
      <img src={src} alt={alt} className="block h-auto w-full" />
      {pool ? <WorkTag pool={pool} visibility={visibility ?? (pool === 'paid' ? 'private' : 'public')} className="absolute bottom-3 left-3" /> : null}
    </figure>
  )
}

// Message key under app.work: free works are public with a watermark; paid ones private or public.
export function workTagKey(pool: CreditPool, visibility: 'public' | 'private'): 'freePublic' | 'private' | 'public' {
  if (pool === 'free') return 'freePublic'
  return visibility === 'private' ? 'private' : 'public'
}

export function WorkTag({ pool, visibility, className }: { pool: CreditPool; visibility: 'public' | 'private'; className?: string }) {
  const t = useTranslations('app.work')
  return (
    <span
      className={cn(
        'inline-flex min-h-[26px] items-center rounded-full px-2 py-1 text-caption leading-none font-semibold',
        pool === 'paid' ? 'bg-foreground text-background' : 'frost text-foreground',
        className,
      )}
    >
      {t(workTagKey(pool, visibility))}
    </span>
  )
}
