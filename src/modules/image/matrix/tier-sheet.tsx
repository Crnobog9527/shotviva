'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { tierPool } from '@/core/billing/pools'
import type { Resolution } from '@/core/templates/output-options'
import { cn } from '@/core/ui/cn'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { CheckBox } from './check-box'

export type TierChoice = { tier: Resolution; credits: number }

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description: string
  choices: readonly TierChoice[]
  current: Resolution | null
  promo: boolean
  // A single result: "the other N of this template too", and skip / bring back.
  others?: number
  removed?: boolean
  onPick(tier: Resolution, alsoOthers: boolean): void
  onSkip?(skip: boolean): void
}

// Picking a result's tier, or the whole batch's (Owner 2026-11-28). Each tier says which credits
// pay it (the tier decides the pool, 1996) and what it makes; only tiers the template's model
// makes and the admin sells are listed, and 1K only for an affiliate org member (2034).
export function TierSheet({ open, onOpenChange, title, description, choices, current, promo, others = 0, removed = false, onPick, onSkip }: Props) {
  const t = useTranslations('app.matrix.review')
  const [also, setAlso] = useState(false)
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={title} description={description} nested>
      {others > 0 ? (
        <button type="button" onClick={() => setAlso((on) => !on)} aria-pressed={also} className="mt-3 flex min-h-11 items-center gap-2.5 text-left text-label">
          <CheckBox state={also ? 'on' : 'off'} />
          {t('alsoTemplate', { count: others })}
        </button>
      ) : null}
      <div className="mt-3 grid gap-2">
        {choices.map((choice) => <TierOption key={choice.tier} choice={choice} chosen={!removed && current === choice.tier} promo={promo} onPick={() => onPick(choice.tier, also)} />)}
      </div>
      {onSkip ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-caption text-muted-foreground">{t(removed ? 'restoreLine' : 'skipLine')}</span>
          <button type="button" onClick={() => onSkip(!removed)} className="press hairline h-9 rounded-full bg-wash px-3.5 text-caption font-medium text-bone-dim hover:text-foreground">
            {t(removed ? 'restore' : 'skip')}
          </button>
        </div>
      ) : null}
    </ResponsiveSheet>
  )
}

function TierOption({ choice, chosen, promo, onPick }: { choice: TierChoice; chosen: boolean; promo: boolean; onPick(): void }) {
  const t = useTranslations('app.matrix.review')
  const free = tierPool(choice.tier) === 'free'
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onPick}
      className={cn('press grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] px-3.5 py-3 text-left', chosen ? 'chosen' : 'hairline bg-card')}
    >
      <span className="text-[20px] leading-none font-semibold tracking-[-0.01em]">{choice.tier.toUpperCase()}</span>
      <span className="min-w-0">
        <b className="block text-label font-semibold">{t(free ? 'usePromo' : promo ? 'useOrgPaid' : 'usePaid')}</b>
        <span className="block text-caption text-muted-foreground">{t(free ? 'promoUse' : 'paidUse')}</span>
      </span>
      <span className="text-right">
        <span className="block font-mono text-label">{choice.credits}</span>
        <span className="block text-caption text-muted-foreground">{t('credits')}</span>
      </span>
    </button>
  )
}
