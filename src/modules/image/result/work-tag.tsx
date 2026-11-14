import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import type { CreditPool } from '@/core/billing/pools'

// Message key under app.work: free works are public with a watermark, except a poster work
// (gallery-excluded, always private); paid ones private or public.
export function workTagKey(pool: CreditPool, visibility: 'public' | 'private'): 'freePublic' | 'freePrivate' | 'private' | 'public' {
  if (pool === 'free') return visibility === 'private' ? 'freePrivate' : 'freePublic'
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
