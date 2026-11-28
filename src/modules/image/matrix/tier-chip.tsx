'use client'

import { ChevronDownIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import type { MatrixCell } from './matrix-state'

// A result's tier and price on the right of its row (Owner 2026-11-28). It opens the tier sheet
// (which also skips or brings back the result). Paid tiers carry the safelight rim; a 1K result,
// paid from an affiliate org's promotion share, a bone rim so the two pools read apart.
export function TierChip({ cell, promo, onOpen }: { cell: MatrixCell; promo: boolean; onOpen(): void }) {
  const t = useTranslations('app.matrix.review')
  if (cell.removed) {
    return (
      <button type="button" onClick={onOpen} className="press inline-flex h-10 items-center gap-1.5 rounded-[12px] px-3 text-caption whitespace-nowrap text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)] [background:repeating-linear-gradient(135deg,transparent_0_6px,var(--wash)_6px_8px)]">
        <XIcon aria-hidden="true" className="size-4" />
        {t('skippedChip')}
      </button>
    )
  }
  const tier = (cell.tier ?? '2k').toUpperCase()
  const free = cell.pool === 'free'
  const pool = free ? t('tierPromo') : t(promo ? 'tierOrgPaid' : 'tierPaid')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('tierChip', { tier: `${tier} ${pool}`, credits: cell.credits })}
      className={cn(
        'press inline-flex h-10 items-center gap-1.5 rounded-[12px] pr-2.5 pl-3 text-caption whitespace-nowrap',
        free ? 'bg-wash shadow-[inset_0_0_0_1.5px_var(--bone-dim)]' : 'chosen',
      )}
    >
      <b className="font-semibold">{tier}</b>
      <span className={cn('text-bone-dim', !free && 'max-md:hidden')}>{pool}</span>
      <span className="font-mono text-bone-dim">{cell.credits}</span>
      {cell.tiers.length > 1 ? <ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" /> : null}
    </button>
  )
}
