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

// On Photos' grid a tile is marked only when the work is not the usual private, clean one:
// "Public" when anyone can see it (that it then carries a watermark shows in the picture), or
// "Watermark" on a private free work (a poster). A paid private work carries no mark.
export function workMarkKey(pool: CreditPool, visibility: 'public' | 'private'): 'public' | 'watermark' | null {
  if (visibility === 'public') return 'public'
  return pool === 'free' ? 'watermark' : null
}

// personal: on Photos' company view (§6.5), one of the reader's own works among the company's;
// it says so first, since everything else there is the company's.
export function WorkMark({ pool, visibility, personal, className }: { pool: CreditPool; visibility: 'public' | 'private'; personal?: boolean; className?: string }) {
  const t = useTranslations('app.work')
  const key = workMarkKey(pool, visibility)
  if (!key && !personal) return null
  const text = [personal ? t('personal') : null, key ? t(key) : null].filter(Boolean).join(' · ')
  return <span className={cn('frost inline-flex min-h-6 max-w-[calc(100%-12px)] items-center truncate rounded-full px-2 text-caption leading-none font-medium text-photo-ink', className)}>{text}</span>
}
